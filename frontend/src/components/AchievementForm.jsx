import { useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import { Plus, Trash2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";

const API = "/api/achievements";
const MAX_MB = 8;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const TIERS = [
    ["gold", "Gold"],
    ["silver", "Silver"],
    ["bronze", "Bronze"],
    ["ranking", "Ranking / Position"],
];

const inputCls =
    "w-full border border-stone-700 bg-[#0C1D14] px-4 py-3 text-sm text-white placeholder:text-stone-600 focus:border-[#C9A227] focus:outline-none";
const labelCls = "mb-2 block font-mono2 text-[11px] uppercase tracking-[0.25em] text-stone-400";

export const AchievementForm = ({ initial, onClose, onSaved }) => {
    const isNew = !initial?.id;
    const [form, setForm] = useState({
        title: initial?.title || "",
        year: initial?.year || "",
        location: initial?.location || "",
        org: initial?.org || "",
        description: initial?.description || "",
    });
    const [rows, setRows] = useState(
        initial?.results?.length ? initial.results.map((r) => ({ ...r })) : [{ label: "", tier: "gold" }]
    );
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(initial?.image ? `${API}/file/${initial.id}` : null);
    const [removeImage, setRemoveImage] = useState(false);
    const [busy, setBusy] = useState(false);

    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
    const setRow = (i, key, value) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

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
        setRemoveImage(false);
    };

    const clearImage = () => {
        setFile(null);
        setPreview(null);
        setRemoveImage(true);
    };

    const submit = async () => {
        if (form.title.trim().length < 2) {
            toast.error("Achievement name is required.");
            return;
        }
        const results = rows.filter((r) => r.label.trim());
        if (!results.length) {
            toast.error("Add at least one category / result.");
            return;
        }
        setBusy(true);
        try {
            const fd = new FormData();
            Object.entries(form).forEach(([k, v]) => fd.append(k, v.trim()));
            fd.append("results", JSON.stringify(results.map((r) => ({ label: r.label.trim(), tier: r.tier }))));
            fd.append("remove_image", removeImage ? "true" : "false");
            if (file) fd.append("file", file);
            const res = isNew
                ? await axios.post(API, fd, { headers: { "Content-Type": "multipart/form-data" } })
                : await axios.put(`${API}/${initial.id}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
            onSaved(res.data, isNew);
        } catch (err) {
            toast.error(err.response?.status === 401 || err.response?.status === 403 ? "Owner access required." : err.response?.data?.detail || "Could not save the achievement. Please try again.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={isNew ? "Add achievement" : "Edit achievement"}
            data-testid="achievement-form-modal"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="max-h-[90vh] w-full max-w-xl overflow-y-auto border border-[#C9A227]/40 bg-[#123222] p-6 sm:p-8"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4">
                    <h3 className="font-display text-2xl font-extrabold uppercase text-white">
                        {isNew ? "Add achievement" : "Edit achievement"}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        data-testid="af-cancel-button"
                        aria-label="Close form"
                        className="flex h-10 w-10 shrink-0 items-center justify-center border border-[#C9A227]/50 text-white transition-colors hover:bg-[#C9A227] hover:text-[#173322]"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>

                <div className="mt-6 space-y-5">
                    <div>
                        <label htmlFor="af-title" className={labelCls}>Achievement / Competition Name</label>
                        <input id="af-title" data-testid="af-title-input" type="text" value={form.title} onChange={set("title")} placeholder="e.g. Mr. Universe 2023" className={inputCls} />
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2">
                        <div>
                            <label htmlFor="af-year" className={labelCls}>Year</label>
                            <input id="af-year" data-testid="af-year-input" type="text" value={form.year} onChange={set("year")} placeholder="e.g. 2023" className={inputCls} />
                        </div>
                        <div>
                            <label htmlFor="af-location" className={labelCls}>Location</label>
                            <input id="af-location" data-testid="af-location-input" type="text" value={form.location} onChange={set("location")} placeholder="e.g. Thailand, Pattaya" className={inputCls} />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="af-org" className={labelCls}>Organization / Federation</label>
                        <input id="af-org" data-testid="af-org-input" type="text" value={form.org} onChange={set("org")} placeholder="e.g. IBBF" className={inputCls} />
                    </div>

                    <div>
                        <p className={labelCls}>Category & Medal / Position</p>
                        <div className="space-y-3">
                            {rows.map((r, i) => (
                                <div key={i} className="flex gap-2">
                                    <input
                                        type="text"
                                        value={r.label}
                                        onChange={(e) => setRow(i, "label", e.target.value)}
                                        placeholder="e.g. Bodybuilding — Gold Medal"
                                        data-testid={`af-result-label-${i}`}
                                        className={`${inputCls} min-w-0 flex-1`}
                                    />
                                    <select
                                        value={r.tier}
                                        onChange={(e) => setRow(i, "tier", e.target.value)}
                                        data-testid={`af-result-tier-${i}`}
                                        aria-label="Medal type"
                                        className="w-44 shrink-0 border border-stone-700 bg-[#0C1D14] px-3 py-3 text-sm text-white focus:border-[#C9A227] focus:outline-none"
                                    >
                                        {TIERS.map(([v, l]) => (
                                            <option key={v} value={v}>{l}</option>
                                        ))}
                                    </select>
                                    {rows.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                                            data-testid={`af-result-remove-${i}`}
                                            aria-label="Remove this result row"
                                            className="flex w-11 shrink-0 items-center justify-center border border-stone-700 text-stone-400 transition-colors hover:border-[#C9A227] hover:text-[#E3B94E]"
                                        >
                                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => setRows((rs) => [...rs, { label: "", tier: "gold" }])}
                            data-testid="af-add-result-button"
                            className="mt-3 inline-flex items-center gap-2 font-mono2 text-[11px] uppercase tracking-[0.2em] text-[#E3B94E] transition-colors hover:text-white"
                        >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add another category
                        </button>
                    </div>

                    <div>
                        <label htmlFor="af-description" className={labelCls}>Description (optional)</label>
                        <textarea id="af-description" data-testid="af-description-input" rows={3} maxLength={400} value={form.description} onChange={set("description")} placeholder="Short note about this achievement" className={`${inputCls} resize-none`} />
                    </div>

                    <div>
                        <p className={labelCls}>Achievement Image (optional)</p>
                        <input id="af-image" data-testid="af-image-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={pickFile} className="hidden" />
                        {preview ? (
                            <div>
                                <img src={preview} alt="Achievement image preview" data-testid="af-image-preview" className="max-h-56 w-full border border-border object-contain" />
                                <div className="mt-3 flex gap-4">
                                    <label htmlFor="af-image" data-testid="af-change-image-button" className="cursor-pointer font-mono2 text-[11px] uppercase tracking-[0.2em] text-[#E3B94E] hover:text-white">
                                        Change image
                                    </label>
                                    <button type="button" onClick={clearImage} data-testid="af-remove-image-button" className="font-mono2 text-[11px] uppercase tracking-[0.2em] text-stone-400 hover:text-white">
                                        Remove image
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <label
                                htmlFor="af-image"
                                data-testid="af-choose-image-button"
                                className="flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-[#C9A227]/50 px-6 py-8 text-center transition-colors hover:border-[#C9A227]"
                            >
                                <UploadCloud className="h-6 w-6 text-[#E3B94E]" aria-hidden="true" />
                                <span className="font-display text-sm font-bold uppercase tracking-wider text-white">Choose image</span>
                                <span className="font-mono2 text-[10px] uppercase tracking-[0.2em] text-stone-400">JPG · PNG · WEBP · max 8 MB</span>
                            </label>
                        )}
                    </div>
                </div>

                <div className="mt-8 flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 border border-[#C9A227]/50 py-3.5 font-display text-base font-bold uppercase tracking-wider text-white transition-colors hover:border-[#E3B94E]"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={submit}
                        disabled={busy}
                        data-testid="af-save-button"
                        className="flex-1 bg-[#C9A227] py-3.5 font-display text-base font-bold uppercase tracking-wider text-[#173322] transition-colors hover:bg-[#E3B94E] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {busy ? "Saving…" : isNew ? "Add Achievement" : "Save Changes"}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default AchievementForm;
