import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import Seo from "@/components/Seo";
import { Reveal } from "@/components/Reveal";
import CtaBanner from "@/components/CtaBanner";
import AchievementForm from "@/components/AchievementForm";
import SocialIcons from "@/components/SocialIcons";
import { useAuth } from "@/context/AuthContext";
import { MEDAL_STYLES, IMAGES, SOCIALS } from "@/data/content";

const API = "/api/achievements";

const FILTERS = [
    { key: "all", label: "All" },
    { key: "gold", label: "Gold" },
    { key: "silver", label: "Silver" },
    { key: "bronze", label: "Bronze" },
    { key: "ranking", label: "Rankings" },
];

const Achievements = () => {
    const [achievements, setAchievements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const { isOwner } = useAuth();
    const [deleteBusy, setDeleteBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await axios.get(API);
            setAchievements(res.data.items || []);
        } catch {
            toast.error("Could not load achievements.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const list = useMemo(
        () => (filter === "all" ? achievements : achievements.filter((a) => a.results.some((r) => r.tier === filter))),
        [achievements, filter]
    );

    const onSaved = (saved, isNew) => {
        setAchievements((prev) => (isNew ? [...prev, saved] : prev.map((a) => (a.id === saved.id ? saved : a))));
        setEditing(null);
        toast.success(isNew ? "Achievement added." : "Achievement updated.");
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        setDeleteBusy(true);
        try {
            await axios.delete(`${API}/${deleting.id}`);
            setAchievements((prev) => prev.filter((a) => a.id !== deleting.id));
            toast.success("Achievement removed.");
            setDeleting(null);
        } catch (err) {
            toast.error(err.response?.status === 401 || err.response?.status === 403 ? "Owner access required." : err.response?.data?.detail || "Could not remove the achievement. Please try again.");
        } finally {
            setDeleteBusy(false);
        }
    };

    return (
        <>
            <Seo
                title="Achievements | Bapi Das — Mr. Universe 2023, Mr. World 2018 | IRONBLOOD FITNESS STUDIO"
                description="The complete competitive record of Bapi Das: Mr. Universe 2023 Double Gold, Mr. World 2018 Double Gold, 2× Junior Mr. India Gold, 13× Mr. Bengal Gold and more."
                path="/achievements"
                image="/images/bapi-collage.jpg"
            />
            <header className="on-gold border-b border-border pt-40 pb-16 sm:pb-20">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <p className="font-mono2 text-[11px] sm:text-xs uppercase tracking-[0.3em] text-[#1B5E3A]">The Record</p>
                    <h1 className="mt-4 font-display text-5xl font-black uppercase leading-[0.9] tracking-tight text-white sm:text-7xl">
                        {achievements.length || 14} achievements.
                        <span className="block text-stroke">One standard.</span>
                    </h1>
                    <p className="mt-6 max-w-2xl text-base leading-relaxed text-stone-400 sm:text-lg">
                        Every title, medal and ranking from the competitive career of Bapi Das — presented exactly as earned.
                    </p>
                </div>
            </header>

            <section className="border-b border-border" data-testid="champion-banner-section">
                <Reveal>
                    <img
                        src={IMAGES.compPoster.src}
                        alt={IMAGES.compPoster.alt}
                        loading="lazy"
                        className="w-full object-cover object-center max-h-[520px]"
                    />
                </Reveal>
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
                    <p className="font-mono2 text-[10px] uppercase tracking-[0.25em] text-stone-600">On stage — trophy presentation</p>
                    <p className="font-mono2 text-[10px] uppercase tracking-[0.25em] text-[#1B5E3A]">Ironblood Muscle & Fitness Studio</p>
                </div>
            </section>

            <section className="border-b border-border bg-[#123222] py-16 sm:py-20" data-testid="on-stage-section">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex items-end justify-between gap-6">
                        <h2 className="font-display text-3xl font-extrabold uppercase tracking-tight text-white sm:text-4xl">On stage</h2>
                        <p className="hidden font-mono2 text-[10px] uppercase tracking-[0.25em] text-stone-600 sm:block">Contest condition · Championship lights</p>
                    </div>
                    <div className="mt-10 grid gap-5 sm:grid-cols-2">
                        {[IMAGES.bapiStageBw, IMAGES.bapiStageSide].map((img) => (
                            <Reveal key={img.src}>
                                <figure className="group relative overflow-hidden border border-border">
                                    <img
                                        src={img.src}
                                        alt={img.alt}
                                        loading="lazy"
                                        className="aspect-[4/5] w-full object-cover object-top transition-transform duration-700 group-hover:scale-[1.03]"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-70" aria-hidden="true" />
                                </figure>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </section>

            <section className="on-gold py-20 sm:py-28" data-testid="achievements-list-section">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter achievements by medal">
                            {FILTERS.map((f) => (
                                <button
                                    key={f.key}
                                    type="button"
                                    onClick={() => setFilter(f.key)}
                                    data-testid={`achievement-filter-${f.key}-button`}
                                    aria-pressed={filter === f.key}
                                    className={`border px-5 py-2.5 font-display text-sm font-bold uppercase tracking-wider transition-colors duration-200 ${
                                        filter === f.key
                                            ? "border-[#173322] bg-[#173322] text-[#F4EDDD]"
                                            : "border-[#173322]/50 text-[#37422F] hover:border-[#173322] hover:text-[#173322]"
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                        {isOwner && (
                        <button
                            type="button"
                            onClick={() => setEditing("new")}
                            data-testid="achievement-add-button"
                            className="inline-flex items-center gap-2 border border-[#C9A227] px-5 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-[#8A5A17] transition-colors duration-200 hover:bg-[#C9A227] hover:text-[#173322]"
                        >
                            <Plus className="h-4 w-4" aria-hidden="true" /> Add Achievement
                        </button>
                        )}
                    </div>

                    {loading ? (
                        <p className="mt-12 font-mono2 text-xs uppercase tracking-[0.25em] text-stone-500" data-testid="achievements-loading">
                            Loading achievements…
                        </p>
                    ) : list.length === 0 ? (
                        <div className="mt-12 border border-dashed border-[#173322]/40 p-10 text-center" data-testid="achievements-empty">
                            <p className="font-display text-xl font-bold uppercase text-[#173322]">No achievements in this view</p>
                            <p className="mt-2 text-sm text-stone-500">Use + Add Achievement to create one.</p>
                        </div>
                    ) : (
                        <motion.div layout className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                            <AnimatePresence mode="popLayout">
                                {list.map((a, i) => {
                                    const topTier = a.results[0]?.tier || "ranking";
                                    const style = MEDAL_STYLES[topTier];
                                    return (
                                        <motion.article
                                            layout
                                            key={a.id}
                                            initial={{ opacity: 0, y: 24 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.97 }}
                                            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                                            className={`group flex flex-col border bg-[#142B21] p-7 transition-all duration-300 hover:-translate-y-1 hover:bg-[#1B5E3A] ${
                                                topTier === "gold" ? "border-[#D4AF37]/30 hover:border-[#D4AF37]/60" : "border-border hover:border-[#D4AF37]/60"
                                            }`}
                                            data-testid={`achievement-card-${i + 1}`}
                                        >
                                            {a.image && (
                                                <img
                                                    src={`${API}/file/${a.id}`}
                                                    alt={a.title}
                                                    loading="lazy"
                                                    className="mb-5 aspect-[16/9] w-full border border-border object-cover"
                                                    data-testid={`achievement-image-${i + 1}`}
                                                />
                                            )}
                                            <div className="flex items-start justify-between gap-4">
                                                <p className="font-mono2 text-[10px] uppercase tracking-[0.25em] text-stone-600">
                                                    {a.year || "Career"} {a.org ? `· ${a.org}` : ""}
                                                </p>
                                                <span className={`border px-2 py-0.5 font-mono2 text-[9px] uppercase tracking-[0.2em] ${style.ring} ${style.text}`}>
                                                    {style.label}
                                                </span>
                                            </div>
                                            <h2 className="mt-4 font-display text-2xl font-extrabold uppercase leading-tight text-white">{a.title}</h2>
                                            <ul className="mt-5 space-y-2">
                                                {a.results.map((r) => (
                                                    <li key={r.label} className={`flex items-center gap-2.5 text-sm font-semibold ${MEDAL_STYLES[r.tier].text}`}>
                                                        <span className="h-1.5 w-1.5 rotate-45" style={{ background: MEDAL_STYLES[r.tier].dot }} aria-hidden="true" />
                                                        {r.label}
                                                    </li>
                                                ))}
                                            </ul>
                                            {a.description && <p className="mt-4 text-xs leading-relaxed text-stone-400">{a.description}</p>}
                                            <div className="mt-6 flex flex-1 items-end justify-between gap-3 border-t border-stone-800 pt-4">
                                                <p className="text-xs uppercase tracking-[0.15em] text-stone-600">{a.location}</p>
                                                <div className="flex shrink-0 gap-2">
                                                    {isOwner && (
                                                        <>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditing(a)}
                                                        data-testid={`achievement-edit-${i + 1}`}
                                                        aria-label={`Edit achievement: ${a.title}`}
                                                        className="inline-flex items-center gap-1.5 border border-stone-700 px-3 py-1.5 font-mono2 text-[10px] uppercase tracking-[0.2em] text-stone-400 transition-colors hover:border-[#C9A227] hover:text-[#E3B94E]"
                                                    >
                                                        <Pencil className="h-3 w-3" aria-hidden="true" /> Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeleting(a)}
                                                        data-testid={`achievement-remove-${i + 1}`}
                                                        aria-label={`Remove achievement: ${a.title}`}
                                                        className="inline-flex items-center gap-1.5 border border-stone-700 px-3 py-1.5 font-mono2 text-[10px] uppercase tracking-[0.2em] text-stone-400 transition-colors hover:border-[#C9A227] hover:text-[#E3B94E]"
                                                    >
                                                        <X className="h-3 w-3" aria-hidden="true" /> Remove
                                                    </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.article>
                                    );
                                })}
                            </AnimatePresence>
                        </motion.div>
                    )}

                    <Reveal className="mt-16">
                        <div className="flex flex-col items-start gap-6 border border-border bg-[#123222] p-8 sm:flex-row sm:items-center">
                            <img
                                src={IMAGES.trophyWall.src}
                                alt={IMAGES.trophyWall.alt}
                                loading="lazy"
                                className="w-full border border-border object-cover sm:w-64"
                            />
                            <div>
                                <h2 className="font-display text-2xl font-extrabold uppercase text-white sm:text-3xl">The wall of proof</h2>
                                <p className="mt-3 max-w-xl text-sm leading-relaxed text-stone-400">
                                    Trophies, medals and certificates from these championships are displayed inside the studio — visit and see
                                    the record in person.
                                </p>
                                <div className="mt-5">
                                    <p className="font-mono2 text-[10px] uppercase tracking-[0.25em] text-stone-500">Follow Bapi Das</p>
                                    <SocialIcons links={SOCIALS.owner} tone="onGreen" testId="achievements-owner-social" className="mt-3" />
                                </div>
                            </div>
                        </div>
                    </Reveal>
                </div>
            </section>

            <CtaBanner testId="achievements-cta-banner" eyebrow="LEARN FROM A CHAMPION" title="Train under a proven competitor" />

            <AnimatePresence>
                {editing && (
                    <AchievementForm
                        initial={editing === "new" ? null : editing}
                        onClose={() => setEditing(null)}
                        onSaved={onSaved}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {deleting && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4"
                        role="alertdialog"
                        aria-modal="true"
                        aria-label="Confirm achievement removal"
                        data-testid="achievement-delete-modal"
                        onClick={() => setDeleting(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                            className="w-full max-w-md border border-[#C9A227]/40 bg-[#123222] p-6 sm:p-8"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 className="font-display text-2xl font-extrabold uppercase text-white">Remove this achievement?</h3>
                            <p className="mt-2 text-sm text-stone-400">
                                Are you sure you want to remove this achievement? This cannot be undone.
                            </p>
                            <div className="mt-5 border border-border bg-[#0C1D14] p-4" data-testid="achievement-delete-preview">
                                <p className="font-display text-lg font-bold uppercase text-white">{deleting.title}</p>
                                <p className="mt-1 font-mono2 text-[10px] uppercase tracking-[0.2em] text-stone-500">
                                    {deleting.year || "Career"} {deleting.location ? `· ${deleting.location}` : ""}
                                </p>
                                {deleting.image && (
                                    <img
                                        src={`${API}/file/${deleting.id}`}
                                        alt={deleting.title}
                                        className="mt-3 max-h-40 w-full border border-border object-contain"
                                    />
                                )}
                            </div>
                            <div className="mt-6 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setDeleting(null)}
                                    data-testid="achievement-delete-cancel-button"
                                    className="flex-1 border border-[#C9A227]/50 py-3 font-display text-base font-bold uppercase tracking-wider text-white transition-colors hover:border-[#E3B94E]"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmDelete}
                                    disabled={deleteBusy}
                                    data-testid="achievement-delete-confirm-button"
                                    className="flex-1 bg-[#C9A227] py-3 font-display text-base font-bold uppercase tracking-wider text-[#173322] transition-colors hover:bg-[#E3B94E] disabled:opacity-60"
                                >
                                    {deleteBusy ? "Removing…" : "Remove"}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default Achievements;
