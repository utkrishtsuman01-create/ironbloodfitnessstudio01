import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bcrypt
import jwt
import requests
from dotenv import load_dotenv
from vercel.blob import AsyncBlobClient
from vercel.headers import set_headers
from fastapi import (
    APIRouter,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
)
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()


@app.middleware("http")
async def vercel_context_middleware(request: Request, call_next):
    set_headers(request.headers)
    return await call_next(request)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    
    # Convert to dict and serialize datetime to ISO string for MongoDB
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=list[StatusCheck])
async def get_status_checks():
    # Exclude MongoDB's _id field from the query results
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    
    # Convert ISO string timestamps back to datetime objects
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    
    return status_checks

# ---------------- Authentication (JWT, httpOnly cookies) ----------------
import re as _re

JWT_ALGORITHM = "HS256"
ACCESS_TTL_HOURS = 24
REFRESH_TTL_DAYS = 7
EMAIL_RE = _re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = _re.compile(r"^[6-9]\d{9}$")


def normalize_phone(raw: str) -> str:
    digits = _re.sub(r"\D", "", raw or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user: dict) -> str:
    payload = {
        "sub": user["id"],
        "phone": user["phone"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TTL_HOURS),
        "type": "access",
    }
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TTL_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, user: dict):
    response.set_cookie(
        key="access_token", value=create_access_token(user),
        httponly=True, secure=True, samesite="lax", max_age=ACCESS_TTL_HOURS * 3600, path="/",
    )
    response.set_cookie(
        key="refresh_token", value=create_refresh_token(user["id"]),
        httponly=True, secure=True, samesite="lax", max_age=REFRESH_TTL_DAYS * 86400, path="/",
    )


def public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user.get("email", ""),
        "phone": user["phone"],
        "picture": user.get("picture", ""),
        "is_owner": bool(user.get("is_owner")),
    }


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def require_owner(user: dict = Depends(get_current_user)) -> dict:
    if not user.get("is_owner"):
        raise HTTPException(status_code=403, detail="Owner access required.")
    return user


class SignupRequest(BaseModel):
    name: str
    email: str
    phone: str
    password: str
    confirm_password: str = ""


class LoginRequest(BaseModel):
    phone: str
    password: str


@api_router.post("/auth/signup", status_code=201)
async def signup(payload: SignupRequest, response: Response):
    name = payload.name.strip()
    email = payload.email.strip().lower()
    phone = normalize_phone(payload.phone)
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Please enter your full name.")
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")
    if not PHONE_RE.match(phone):
        raise HTTPException(status_code=400, detail="Please enter a valid 10-digit Indian mobile number.")
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    if payload.confirm_password and payload.password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match.")
    if await db.users.find_one({"phone": phone}):
        raise HTTPException(status_code=400, detail="An account with this phone number already exists.")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with this email address already exists.")
    user = {
        "id": str(uuid.uuid4()),
        "name": name[:80],
        "email": email[:120],
        "phone": phone,
        "password_hash": hash_password(payload.password),
        "is_owner": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    set_auth_cookies(response, user)
    return public_user(user)


@api_router.post("/auth/login")
async def login(payload: LoginRequest, request: Request, response: Response):
    phone = normalize_phone(payload.phone)
    identifier = f"{request.client.host if request.client else 'unknown'}:{phone}"
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= 5:
        locked_until = attempt.get("locked_until")
        if locked_until and datetime.fromisoformat(locked_until) > datetime.now(timezone.utc):
            raise HTTPException(status_code=429, detail="Too many failed attempts. Please try again in 15 minutes.")
    user = await db.users.find_one({"phone": phone})
    if user and not user.get("password_hash"):
        raise HTTPException(status_code=400, detail="This account uses Google sign-in. Please continue with Google.")
    if not user or not verify_password(payload.password, user["password_hash"]):
        count = (attempt.get("count", 0) if attempt else 0) + 1
        update = {"count": count}
        if count >= 5:
            update["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
        await db.login_attempts.update_one({"identifier": identifier}, {"$set": update}, upsert=True)
        raise HTTPException(status_code=401, detail="Incorrect phone number or password.")
    await db.login_attempts.delete_one({"identifier": identifier})
    set_auth_cookies(response, user)
    return public_user(user)


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return public_user(user)


@api_router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    response.set_cookie(
        key="access_token", value=create_access_token(user),
        httponly=True, secure=True, samesite="lax", max_age=ACCESS_TTL_HOURS * 3600, path="/",
    )
    return {"ok": True}


class GoogleSessionRequest(BaseModel):
    session_id: str


@api_router.post("/auth/google/session")
async def google_session(payload: GoogleSessionRequest, response: Response):
    try:
        resp = requests.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": payload.session_id},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.error(f"Google session exchange failed: {exc}")
        raise HTTPException(status_code=401, detail="Google sign-in failed. Please try again.")
    email = (data.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Google sign-in failed. Please try again.")
    user = await db.users.find_one({"email": email})
    if user is None:
        user = {
            "id": str(uuid.uuid4()),
            "name": (data.get("name") or "Member").strip()[:80],
            "email": email,
            "phone": f"google:{email}",
            "password_hash": None,
            "picture": data.get("picture", ""),
            "google_id": data.get("id", ""),
            "is_owner": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(user)
        logger.info(f"Google user created: {email}")
    else:
        updates = {}
        if data.get("name") and data["name"].strip() != user.get("name"):
            updates["name"] = data["name"].strip()[:80]
        if data.get("picture") and data["picture"] != user.get("picture"):
            updates["picture"] = data["picture"]
        if data.get("id") and not user.get("google_id"):
            updates["google_id"] = data["id"]
        if updates:
            await db.users.update_one({"email": email}, {"$set": updates})
            user.update(updates)
    set_auth_cookies(response, user)
    return public_user(user)


async def seed_owner():
    phone = os.environ.get("OWNER_PHONE", "")
    password = os.environ.get("OWNER_PASSWORD", "")
    if not phone or not password:
        logger.warning("Owner credentials not configured")
        return
    existing = await db.users.find_one({"phone": phone})
    if existing is None:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "name": "Bapi Das",
            "email": "owner@ironblood.local",
            "phone": phone,
            "password_hash": hash_password(password),
            "is_owner": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Owner account seeded")
    else:
        updates = {}
        if not existing.get("is_owner"):
            updates["is_owner"] = True
        if not verify_password(password, existing["password_hash"]):
            updates["password_hash"] = hash_password(password)
        if updates:
            await db.users.update_one({"phone": phone}, {"$set": updates})
            logger.info("Owner account updated")


@app.on_event("startup")
async def startup_auth():
    try:
        await db.users.create_index("phone", unique=True)
        await db.users.create_index("email", unique=True)
        await db.login_attempts.create_index("identifier")
        await seed_owner()
    except Exception as exc:
        logger.error(f"Auth startup failed: {exc}")


# ---------------- Public gallery (visitor uploads) ----------------


APP_NAME = "ironblood-fitness"
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
MAX_UPLOAD_BYTES = 4 * 1024 * 1024


async def put_object(path: str, data: bytes, content_type: str) -> dict:
    from vercel.blob import AsyncBlobClient

    client = AsyncBlobClient()

    result = await client.put(
        path,
        data,
        access="public",
        content_type=content_type,
        add_random_suffix=False,
    )

    return {
        "path": result.url,
        "url": result.url,
        "size": len(data),
        "content_type": result.content_type,
    }

def get_object(url: str):
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get(
        "Content-Type", "application/octet-stream"
    )


@api_router.get("/gallery")
async def list_gallery():
    docs = await db.gallery_uploads.find(
        {"is_deleted": False},
        {"_id": 0},
    ).sort("created_at", -1).to_list(500)
    return {"items": docs}


@api_router.post("/gallery", status_code=201)
async def upload_gallery_image(
    file: UploadFile = File(...),
    caption: str = Form(""),
    _owner: dict = Depends(require_owner),
):
    content_type = (file.content_type or "").lower()

    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Please upload a JPG, PNG or WEBP image.",
        )

    data = await file.read()

    if not data:
        raise HTTPException(
            status_code=400,
            detail="The selected file is empty.",
        )

    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail="Image is too large. Maximum size is 4 MB.",
        )

    file_id = str(uuid.uuid4())
    path = f"{APP_NAME}/gallery/{file_id}.{ALLOWED_IMAGE_TYPES[content_type]}"

    try:
       result = await put_object(path, data, content_type)
    except Exception as exc:
        logger.error(f"Gallery upload storage failure: {exc}")
        raise HTTPException(
            status_code=502,
            detail="Upload failed. Please try again.",
        )

    doc = {
        "id": file_id,
        "storage_path": result["path"],
        "caption": caption.strip()[:140],
        "content_type": content_type,
        "size": result["size"],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.gallery_uploads.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/gallery/file/{file_id}")
async def get_gallery_file(file_id: str):
    record = await db.gallery_uploads.find_one(
        {"id": file_id, "is_deleted": False}
    )

    if not record:
        raise HTTPException(
            status_code=404,
            detail="Image not found",
        )

    try:
        data, content_type = get_object(record["storage_path"])
    except Exception:
        raise HTTPException(
            status_code=404,
            detail="Image not found",
        )

    return Response(
        content=data,
        media_type=record.get("content_type", content_type),
        headers={"Cache-Control": "public, max-age=86400"},
    )


@api_router.delete("/gallery/{file_id}")
async def delete_gallery_image(
    file_id: str,
    _owner: dict = Depends(require_owner),
):
    result = await db.gallery_uploads.update_one(
        {"id": file_id, "is_deleted": False},
        {"$set": {"is_deleted": True}},
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Image not found",
        )

    return {"ok": True}

# ---------------- Achievements (public, directly editable) ----------------
import json as jsonlib

ALLOWED_TIERS = {"gold", "silver", "bronze", "ranking"}

ACHIEVEMENT_SEED = [
    {"title": "Junior Mr. India (IBBF)", "year": "2016", "location": "Coimbatore, Tamil Nadu", "org": "IBBF", "description": "", "results": [{"label": "Gold Medal", "tier": "gold"}]},
    {"title": "Junior Mr. India (IBBF)", "year": "2017", "location": "Maharashtra", "org": "IBBF", "description": "", "results": [{"label": "Gold Medal", "tier": "gold"}]},
    {"title": "Mr. World 2018, Delhi", "year": "2018", "location": "Delhi", "org": "National Bodybuilding Union International (NBBUI)", "description": "", "results": [{"label": "Bodybuilding — Gold Medal", "tier": "gold"}, {"label": "Classic Physique — Gold Medal", "tier": "gold"}]},
    {"title": "Mr. Universe 2023", "year": "2023", "location": "Thailand, Pattaya", "org": "", "description": "", "results": [{"label": "Bodybuilding — Gold Medal", "tier": "gold"}, {"label": "Classic Bodybuilding — Gold Medal", "tier": "gold"}]},
    {"title": "Mr. Asia 2019", "year": "2019", "location": "Bangalore", "org": "", "description": "", "results": [{"label": "Bodybuilding — Silver Medal", "tier": "silver"}]},
    {"title": "Mr. Asia 2019", "year": "2019", "location": "Bangalore", "org": "", "description": "", "results": [{"label": "Sports Model — Bronze Medal", "tier": "bronze"}]},
    {"title": "Mr. India (Senior) 2019", "year": "2019", "location": "Kochi / Kerala", "org": "", "description": "", "results": [{"label": "Bodybuilding — Silver Medal", "tier": "silver"}]},
    {"title": "Mr. Bengal", "year": "", "location": "West Bengal", "org": "Various Associations", "description": "", "results": [{"label": "13 Times — Gold Medal", "tier": "gold"}, {"label": "4 Times — Silver Medal", "tier": "silver"}, {"label": "3 Times — 3rd Place", "tier": "bronze"}]},
    {"title": "The Fit Expo Kolkata 2017", "year": "2017", "location": "Kolkata", "org": "", "description": "", "results": [{"label": "Bronze Medalist", "tier": "bronze"}]},
    {"title": "Numerous Other Championships", "year": "", "location": "India", "org": "", "description": "", "results": [{"label": "Bodybuilding & Men's Physique Championships", "tier": "ranking"}]},
    {"title": "Satisb Sugar Classic Bodybuilding Championship 2018", "year": "2018", "location": "Belgaum, Andhra Pradesh", "org": "", "description": "", "results": [{"label": "All India — 7th Position", "tier": "ranking"}]},
    {"title": "Federation Cup 2018", "year": "2018", "location": "Patna, Bihar", "org": "IBBF", "description": "", "results": [{"label": "All India — 7th Position", "tier": "ranking"}]},
    {"title": "Senior Mr. India 2018", "year": "2018", "location": "Pune, India", "org": "", "description": "", "results": [{"label": "Positioned in Top 15", "tier": "ranking"}]},
    {"title": "Mr. Asia & Mr. World Selection 2018", "year": "2018", "location": "Chhattisgarh", "org": "", "description": "", "results": [{"label": "Positioned in Top 10", "tier": "ranking"}]},
]


async def seed_achievements():
    if await db.achievements.count_documents({}) > 0:
        return
    now = datetime.now(timezone.utc).isoformat()
    docs = [
        {"id": str(uuid.uuid4()), "sort": i, "image": None, "created_at": now, **a}
        for i, a in enumerate(ACHIEVEMENT_SEED)
    ]
    await db.achievements.insert_many(docs)
    logger.info("Seeded %d achievements", len(docs))


def delete_object(path: str):
    resp = requests.delete(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": init_storage()},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def parse_achievement_form(title, year, location, org, description, results_raw):
    title = (title or "").strip()
    if len(title) < 2:
        raise HTTPException(status_code=400, detail="Achievement name is required.")
    try:
        results = jsonlib.loads(results_raw or "[]")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid results data.")
    if not isinstance(results, list):
        raise HTTPException(status_code=400, detail="Invalid results data.")
    cleaned = []
    for r in results:
        label = str(r.get("label", "")).strip()[:140]
        tier = str(r.get("tier", "")).strip().lower()
        if not label:
            continue
        if tier not in ALLOWED_TIERS:
            raise HTTPException(status_code=400, detail="Invalid medal type.")
        cleaned.append({"label": label, "tier": tier})
    if not cleaned:
        raise HTTPException(status_code=400, detail="Add at least one category / result.")
    return {
        "title": title[:200],
        "year": (year or "").strip()[:20],
        "location": (location or "").strip()[:140],
        "org": (org or "").strip()[:160],
        "description": (description or "").strip()[:400],
        "results": cleaned,
    }


async def store_achievement_image(file):
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file type. Please upload a JPG, PNG or WEBP image.")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="The selected file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Image is too large. Maximum size is 8 MB.")
    path = f"{APP_NAME}/achievements/{uuid.uuid4()}.{ALLOWED_IMAGE_TYPES[content_type]}"
    try:
        put_object(path, data, content_type)
    except Exception as exc:
        logger.error(f"Achievement image storage failure: {exc}")
        raise HTTPException(status_code=502, detail="Image upload failed. Please try again.")
    return {"path": path, "content_type": content_type, "size": len(data)}


@api_router.get("/achievements")
async def list_achievements():
    docs = await db.achievements.find({}, {"_id": 0}).sort([("sort", 1), ("created_at", 1)]).to_list(500)
    if not docs:
        await seed_achievements()
        docs = await db.achievements.find({}, {"_id": 0}).sort([("sort", 1), ("created_at", 1)]).to_list(500)
    return {"items": docs}


@api_router.post("/achievements", status_code=201)
async def create_achievement(
    title: str = Form(""),
    year: str = Form(""),
    location: str = Form(""),
    org: str = Form(""),
    description: str = Form(""),
    results: str = Form("[]"),
    file: UploadFile = File(None),
    _owner: dict = Depends(require_owner),
):
    fields = parse_achievement_form(title, year, location, org, description, results)
    image = None
    if file is not None and file.filename:
        image = await store_achievement_image(file)
    top = await db.achievements.find_one({}, sort=[("sort", -1)])
    doc = {
        "id": str(uuid.uuid4()),
        "sort": (top["sort"] + 1) if top else 0,
        "image": image,
        "created_at": datetime.now(timezone.utc).isoformat(),
        **fields,
    }
    await db.achievements.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/achievements/{achievement_id}")
async def update_achievement(
    achievement_id: str,
    title: str = Form(""),
    year: str = Form(""),
    location: str = Form(""),
    org: str = Form(""),
    description: str = Form(""),
    results: str = Form("[]"),
    remove_image: str = Form("false"),
    file: UploadFile = File(None),
    _owner: dict = Depends(require_owner),
):
    existing = await db.achievements.find_one({"id": achievement_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Achievement not found")
    fields = parse_achievement_form(title, year, location, org, description, results)
    image = existing.get("image")
    if file is not None and file.filename:
        new_image = await store_achievement_image(file)
        if image:
            try:
                delete_object(image["path"])
            except Exception as exc:
                logger.warning(f"Old achievement image cleanup failed: {exc}")
        image = new_image
    elif remove_image == "true" and image:
        try:
            delete_object(image["path"])
        except Exception as exc:
            logger.warning(f"Achievement image removal failed: {exc}")
        image = None
    await db.achievements.update_one({"id": achievement_id}, {"$set": {**fields, "image": image}})
    updated = await db.achievements.find_one({"id": achievement_id}, {"_id": 0})
    return updated


@api_router.get("/achievements/file/{achievement_id}")
async def get_achievement_file(achievement_id: str):
    record = await db.achievements.find_one({"id": achievement_id})
    if not record or not record.get("image"):
        raise HTTPException(status_code=404, detail="Image not found")
    try:
        data, content_type = get_object(record["image"]["path"])
    except Exception:
        raise HTTPException(status_code=404, detail="Image not found")
    return Response(
        content=data,
        media_type=record["image"].get("content_type", content_type),
        headers={"Cache-Control": "public, max-age=86400"},
    )


@api_router.delete("/achievements/{achievement_id}")
async def delete_achievement(achievement_id: str, _owner: dict = Depends(require_owner)):
    existing = await db.achievements.find_one({"id": achievement_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Achievement not found")
    if existing.get("image"):
        try:
            delete_object(existing["image"]["path"])
        except Exception as exc:
            logger.warning(f"Achievement image delete failed: {exc}")
    await db.achievements.delete_one({"id": achievement_id})
    return {"ok": True}


@app.on_event("startup")
async def startup_achievements():
    try:
        await seed_achievements()
    except Exception as exc:
        logger.error(f"Achievement seeding failed: {exc}")


# Include the router in the main app
app.include_router(api_router)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["X-Frame-Options"] = "DENY"
    return response

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
