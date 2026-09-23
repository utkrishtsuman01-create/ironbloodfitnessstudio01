import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { AnimatePresence, motion } from "framer-motion";
import { ImagePlus, X, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import Lightbox from "@/components/Lightbox";
import { useAuth } from "@/context/AuthContext";

const API = "/api/gallery";
const MAX_MB = 8;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export const GalleryPublic = () => {
    const { isOwner } = useAuth();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [caption, setCaption] = useState("");
    const [uploading, setUploading] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [lightbox, setLightbox] = useState(null);
    const inputRef = useRef(null);

    const load = useCallback(async () => {
        try {
            const res = await axios.get(API);
            setItems(res.data.items || []);
        } catch {
            toast.error("Could not load community photos.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const pickFile = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (!ALLOWED.includes(f.type)) {
            toast.error("Unsupported file type. Please choose a JPG, PNG or WEBP image.");
            e.target.value = "";
            return;
        }
        if (f.size > MAX_MB * 1024 * 1024) {
            toast.error(`Image is too large. Maximum size is ${MAX_MB} MB.`);
            e.target.value = "";
            return;
        }
        setFile(f);
        setPreview(URL.createObjectURL(f));
    };

    const resetUpload = () => {
        setFile(null);
        if (preview) URL.revokeObjectURL(preview);
        setPreview(null);
        setCaption("");
        setUploadOpen(false);
    };

    const submit = async () => {
        if (!file) {
            toast.error("Please choose an image first.");
            return;
        }
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("caption", caption);
            const res = await axios.post(API, fd, { headers: { "Content-Type": "multipart/form-data" } });
            setItems((prev) => [res.data, ...prev]);
            toast.success("Image uploaded successfully.");
            resetUpload();
        } catch (err) {
            toast.error(err.response?.status === 401 || err.response?.status === 403 ? "Owner access required." : err.response?.data?.detail || "Upload failed. Please try again.");
        } finally {
            setUploading(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await axios.delete(`${API}/${deleteTarget.id}`);
            setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
            toast.success("Image removed successfully.");
            setDeleteTarget(null);
        } catch (err) {
            toast.error(err.response?.status === 401 || err.response?.status === 403 ? "Owner access required." : err.response?.data?.detail || "Could not remove the image. Please try again.");
        } finally {
            setDeleting(false);
        }
    };

   const lightboxImages = items.map((i) => ({
    src: i.url || `${API}/file/${i.id}`,
    alt: i.caption || "Visitor photo shared on the Ironblood community wall",
}));

    return (
        <section className="on-gold border-t border-border py-16 sm:py-24" data-testid="community-wall-section">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex flex-wrap items-end justify-between gap-6">
                    <div>
                        <p className="font-mono2 text-[11px] sm:text-xs uppercase tracking-[0.3em] text-[#1B5E3A]">Community Wall</p>
                        <h2 className="mt-3 font-display text-3xl font-extrabold uppercase tracking-tight text-white sm:text-4xl">
                            Posted by visitors
                        </h2>
                        <p className="mt-2 max-w-lg text-sm text-stone-500">
                            Share your Ironblood moment — photos posted here are visible to everyone.
                        </p>
                    </div>
                    {isOwner && (
                    <button
                        type="button"
                        onClick={() => setUploadOpen(true)}
                        data-testid="gallery-post-picture-button"
                        className="inline-flex items-center gap-3 bg-[#173322] px-7 py-4 font-display text-base font-bold uppercase tracking-wider text-[#F4EDDD] transition-colors duration-300 hover:bg-[#1B5E3A]"
                    >
                        <ImagePlus className="h-5 w-5" aria-hidden="true" /> + Post Picture
                    </button>
                    )}
                </div>

                {loading ? (
                    <p className="mt-12 font-mono2 text-xs uppercase tracking-[0.25em] text-stone-500" data-testid="community-wall-loading">
                        Loading community photos…
                    </p>
                ) : items.length === 0 ? (
                    <div className="mt-12 border border-dashed border-[#173322]/40 p-10 text-center" data-testid="community-wall-empty">
                        <p className="font-display text-xl font-bold uppercase text-[#173322]">No visitor photos yet</p>
                        <p className="mt-2 text-sm text-stone-500">Be the first to post a picture.</p>
                    </div>
                ) : (
                    <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="community-wall-grid">
                        {items.map((item, idx) => (
                            <motion.figure
                                key={item.id}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.35 }}
                                className="group relative overflow-hidden border border-border bg-[#142B21]"
                                data-testid={`community-photo-${idx + 1}`}
                            >
                                <button
                                    type="button"
                                    onClick={() => setLightbox(idx)}
                                    aria-label={`Open photo${item.caption ? `: ${item.caption}` : ""}`}
                                    data-testid={`community-photo-open-${idx + 1}`}
                                    className="block w-full"
                                >
                                    <img
                                        src={item.url || `${API}/file/${item.id}`}
                                        alt={item.caption || "Visitor photo shared on the Ironblood community wall"}
                                        loading="lazy"
                                        className="aspect-[4/3] w-full object-cover transition-transform duration-700 group-hover:scale-105"
                                    />
                                </button>
                                {item.caption && (
                                    <figcaption className="px-4 py-3 text-xs text-stone-300">{item.caption}</figcaption>
                                )}
                                {isOwner && (
                                <button
                                    type="button"
                                    onClick={() => setDeleteTarget(item)}
                                    data-testid={`community-photo-remove-${idx + 1}`}
                                    aria-label="Remove this image"
                                    className="absolute right-3 top-3 inline-flex items-center gap-2 border border-[#C9A227]/60 bg-[#0C1D14]/90 px-3 py-2 font-mono2 text-[10px] uppercase tracking-[0.2em] text-[#E3B94E] transition-colors hover:bg-[#C9A227] hover:text-[#173322]"
                                >
                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                                </button>
                                )}
                            </motion.figure>
                        ))}
                    </div>
                )}
            </div>

            <AnimatePresence>
                {uploadOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Post a picture"
                        data-testid="gallery-upload-modal"
                        onClick={resetUpload}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                            className="w-full max-w-lg border border-[#C9A227]/40 bg-[#123222] p-6 sm:p-8"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <h3 className="font-display text-2xl font-extrabold uppercase text-white">Post a picture</h3>
                                <button
                                    type="button"
                                    onClick={resetUpload}
                                    data-testid="gallery-upload-close-button"
                                    aria-label="Close upload dialog"
                                    className="flex h-10 w-10 items-center justify-center border border-[#C9A227]/50 text-white transition-colors hover:bg-[#C9A227] hover:text-[#173322]"
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>

                            <input
                                ref={inputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={pickFile}
                                className="hidden"
                                data-testid="gallery-upload-file-input"
                            />
                            {preview ? (
                                <div className="mt-6">
                                    <img src={preview} alt="Preview of the selected upload" className="max-h-64 w-full border border-border object-contain" data-testid="gallery-upload-preview" />
                                    <button
                                        type="button"
                                        onClick={() => inputRef.current?.click()}
                                        data-testid="gallery-upload-change-button"
                                        className="mt-3 font-mono2 text-[11px] uppercase tracking-[0.2em] text-[#E3B94E] hover:text-white"
                                    >
                                        Choose a different image
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => inputRef.current?.click()}
                                    data-testid="gallery-upload-choose-button"
                                    className="mt-6 flex w-full flex-col items-center justify-center gap-3 border border-dashed border-[#C9A227]/50 px-6 py-12 text-center transition-colors hover:border-[#C9A227]"
                                >
                                    <UploadCloud className="h-8 w-8 text-[#E3B94E]" aria-hidden="true" />
                                    <span className="font-display text-lg font-bold uppercase tracking-wider text-white">Choose image</span>
                                    <span className="font-mono2 text-[10px] uppercase tracking-[0.2em] text-stone-400">JPG · PNG · WEBP · max 8 MB</span>
                                </button>
                            )}

                            <label htmlFor="gallery-caption" className="mt-6 block font-mono2 text-[11px] uppercase tracking-[0.25em] text-stone-400">
                                Caption (optional)
                            </label>
                            <input
                                id="gallery-caption"
                                type="text"
                                maxLength={140}
                                value={caption}
                                onChange={(e) => setCaption(e.target.value)}
                                placeholder="Add a short caption"
                                data-testid="gallery-upload-caption-input"
                                className="mt-2 w-full border border-stone-700 bg-[#0C1D14] px-4 py-3 text-sm text-white placeholder:text-stone-600 focus:border-[#C9A227] focus:outline-none"
                            />

                            <button
                                type="button"
                                onClick={submit}
                                disabled={uploading}
                                data-testid="gallery-upload-submit-button"
                                className="mt-6 w-full bg-[#C9A227] py-4 font-display text-lg font-bold uppercase tracking-wider text-[#173322] transition-colors hover:bg-[#E3B94E] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {uploading ? "Uploading…" : "Upload"}
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {deleteTarget && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4"
                        role="alertdialog"
                        aria-modal="true"
                        aria-label="Confirm image removal"
                        data-testid="gallery-delete-modal"
                        onClick={() => setDeleteTarget(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                            className="w-full max-w-md border border-[#C9A227]/40 bg-[#123222] p-6 sm:p-8"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 className="font-display text-2xl font-extrabold uppercase text-white">Remove this image?</h3>
                            <p className="mt-2 text-sm text-stone-400">Are you sure you want to remove this image? This cannot be undone.</p>
                            <img
                                src={deleteTarget.url || `${API}/file/${deleteTarget.id}`}
                                alt={deleteTarget.caption || "Image selected for removal"}
                                className="mt-5 max-h-48 w-full border border-border object-contain"
                                data-testid="gallery-delete-preview"
                            />
                            {deleteTarget.caption && <p className="mt-3 text-xs text-stone-400">“{deleteTarget.caption}”</p>}
                            <div className="mt-6 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setDeleteTarget(null)}
                                    data-testid="gallery-delete-cancel-button"
                                    className="flex-1 border border-[#C9A227]/50 py-3 font-display text-base font-bold uppercase tracking-wider text-white transition-colors hover:border-[#E3B94E]"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmDelete}
                                    disabled={deleting}
                                    data-testid="gallery-delete-confirm-button"
                                    className="flex-1 bg-[#C9A227] py-3 font-display text-base font-bold uppercase tracking-wider text-[#173322] transition-colors hover:bg-[#E3B94E] disabled:opacity-60"
                                >
                                    {deleting ? "Removing…" : "Remove"}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <Lightbox images={lightboxImages} index={lightbox} onClose={() => setLightbox(null)} onNavigate={setLightbox} />
        </section>
    );
};

export default GalleryPublic;
