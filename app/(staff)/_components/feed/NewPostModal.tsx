"use client";

import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ImagePlusIcon, PhotoIcon } from "@/components/shared/icons";
import type { Kid } from "../kids/mockKids";
import type { PostKind } from "./mockPosts";
import {
  createPostAction,
  type CreatePostResult,
} from "@/app/_actions/posts";
import { useFeed } from "./FeedContext";

const KINDS: { value: PostKind; label: string }[] = [
  { value: "comida", label: "Comida" },
  { value: "siesta", label: "Siesta" },
  { value: "actividad", label: "Actividad" },
  { value: "logro", label: "Logro" },
  { value: "animo", label: "Ánimo" },
  { value: "foto", label: "Foto" },
  { value: "anuncio", label: "Anuncio" },
];

const MAX_PHOTOS = 5;

function kindChipClasses(value: PostKind, active: boolean): string {
  const palette: Record<PostKind, string> = {
    comida: "bg-badge-comida-bg text-badge-comida-fg",
    siesta: "bg-badge-siesta-bg text-badge-siesta-fg",
    actividad: "bg-pill-actividad-solid-bg text-pill-actividad-solid-fg",
    logro: "bg-badge-logro-bg text-badge-logro-fg",
    animo: "bg-badge-animo-bg text-badge-animo-fg",
    foto: "bg-badge-foto-bg text-badge-foto-fg",
    anuncio: "bg-badge-anuncio-bg text-badge-anuncio-fg",
  };
  return [
    "rounded-full px-4 py-2 text-[13.5px] font-extrabold border-[1.5px]",
    palette[value],
    active ? "border-ink" : "border-transparent",
  ].join(" ");
}

const INITIAL_STATE: CreatePostResult = { ok: false, error: "" };

export function NewPostModal({ kids }: { kids: Kid[] }) {
  const { modalOpen, closeModal } = useFeed();

  const [state, formAction, isPending] = useActionState<CreatePostResult, FormData>(
    createPostAction,
    INITIAL_STATE,
  );

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allRoom, setAllRoom] = useState(false);
  const [kind, setKind] = useState<PostKind>("actividad");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [attempted, setAttempted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fileInputId = useId();
  const descriptionId = useId();
  const descriptionErrorId = `${descriptionId}-error`;
  const recipientErrorId = useId();

  const previews = useMemo(
    () => files.map((file) => ({ name: file.name, url: URL.createObjectURL(file) })),
    [files],
  );

  useEffect(() => {
    return () => {
      for (const preview of previews) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [previews]);

  useEffect(() => {
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [modalOpen]);

  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) return;
    const dt = new DataTransfer();
    for (const f of files) {
      dt.items.add(f);
    }
    input.files = dt.files;
  }, [files]);

  useEffect(() => {
    if (!modalOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeModal();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [modalOpen, closeModal]);

  const [openCount, setOpenCount] = useState(0);

  useEffect(() => {
    if (modalOpen) {
      setOpenCount((c) => c + 1);
      resetFields();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  function resetFields() {
    setSelectedIds([]);
    setAllRoom(false);
    setKind("actividad");
    setBody("");
    setFiles([]);
    setAttempted(false);
  }

  useEffect(() => {
    if (state.ok) {
      closeModal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function toggleKid(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((kidId) => kidId !== id) : [...prev, id],
    );
  }

  function toggleAllRoom() {
    setAllRoom((prev) => !prev);
    setSelectedIds([]);
  }

  function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? []);
    if (incoming.length === 0) return;
    setFiles((prev) => {
      const merged = [...prev, ...incoming];
      return merged.slice(0, MAX_PHOTOS);
    });
    event.target.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  if (!modalOpen) return null;

  const hasRecipient = allRoom || selectedIds.length > 0;
  const bodyInvalid = body.trim().length === 0;
  const recipientInvalid = !hasRecipient;
  const descriptionInvalid = bodyInvalid;

  const clientError = !state.ok && state.error ? state.error : "";
  const showRecipientError = attempted && recipientInvalid;
  const showDescriptionError = attempted && descriptionInvalid;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (recipientInvalid || descriptionInvalid) {
      event.preventDefault();
      setAttempted(true);
    }
  }

  const visibleKids = allRoom ? [] : kids;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={closeModal}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label="Nueva publicación"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[calc(100dvh-32px)] w-full max-w-[580px] flex-col overflow-hidden rounded-[24px] border border-border bg-modal-bg shadow-modal outline-none"
      >
        <header className="flex flex-none items-center justify-between border-b border-border px-[26px] py-5">
          <button
            type="button"
            onClick={closeModal}
            className="text-[15px] font-bold text-muted-strong"
          >
            Cancelar
          </button>
          <span className="font-display text-[18px] font-semibold text-ink">
            Nueva publicación
          </span>
          <button
            type="submit"
            form="new-post-form"
            disabled={isPending}
            aria-busy={isPending}
            className="text-[15px] font-extrabold text-accent disabled:opacity-60"
          >
            {isPending ? "Publicando…" : "Publicar"}
          </button>
        </header>

        <form
          key={openCount}
          id="new-post-form"
          action={formAction}
          onSubmit={handleSubmit}
          noValidate
          className="overflow-y-auto px-[26px] py-6"
        >
          {clientError ? (
            <p
              role="alert"
              className="mb-4 rounded-[12px] bg-alert-box-bg px-4 py-3 text-[13.5px] font-bold text-alert-title"
            >
              {clientError}
            </p>
          ) : null}

          <div className="mb-[22px]">
            <div className="mb-2.5 text-xs font-extrabold tracking-[0.7px] text-muted-strong">
              PARA
            </div>
            <div className="flex flex-wrap gap-[9px]">
              {visibleKids.map((kid) => {
                const selected = selectedIds.includes(kid.id);
                return (
                  <button
                    key={kid.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleKid(kid.id)}
                    className={`flex items-center gap-2 rounded-full border-[1.5px] py-1.5 pl-1.5 pr-3.5 text-[14px] font-bold ${
                      selected
                        ? "border-chip-on-border bg-chip-on-bg text-chip-on-fg"
                        : "border-chip-off-border bg-chip-off-bg text-chip-off-fg"
                    }`}
                  >
                    <span
                      className="flex h-[26px] w-[26px] items-center justify-center rounded-full font-display text-[13px] font-semibold"
                      style={{
                        backgroundColor: kid.avatar.bg,
                        color: kid.avatar.fg,
                      }}
                    >
                      {kid.initials}
                    </span>
                    {kid.name.split(" ")[0]}
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={allRoom}
                onClick={toggleAllRoom}
                className={`rounded-full border-[1.5px] px-4 py-1.5 text-[14px] font-bold ${
                  allRoom
                    ? "border-chip-on-border bg-chip-on-bg text-chip-on-fg"
                    : "border-chip-off-border bg-chip-off-bg text-chip-off-fg"
                }`}
              >
                Toda la sala
              </button>
              {!allRoom && kids.length === 0 ? (
                <p className="w-full text-[13.5px] text-muted">
                  Aún no hay niños dados de alta.
                </p>
              ) : null}
            </div>
            <input
              type="hidden"
              name="allRoom"
              value={allRoom ? "true" : "false"}
            />
            {selectedIds.map((id) => (
              <input key={id} type="hidden" name="childIds" value={id} />
            ))}
            {showRecipientError ? (
              <p
                id={recipientErrorId}
                className="mt-2 text-xs font-bold text-field-error"
              >
                Selecciona al menos un niño o pulsa Toda la sala.
              </p>
            ) : null}
          </div>

          <div className="mb-[22px]">
            <div className="mb-2.5 text-xs font-extrabold tracking-[0.7px] text-muted-strong">
              TIPO
            </div>
            <div className="flex flex-wrap gap-[9px]">
              {KINDS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={kind === option.value}
                  onClick={() => setKind(option.value)}
                  className={kindChipClasses(option.value, kind === option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <input type="hidden" name="kind" value={kind} />
          </div>

          <div className="mb-[22px]">
            <label
              htmlFor={descriptionId}
              className="mb-2.5 block text-xs font-extrabold tracking-[0.7px] text-muted-strong"
            >
              DESCRIPCIÓN
            </label>
            <textarea
              id={descriptionId}
              name="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Cuenta cómo le fue hoy…"
              aria-invalid={showDescriptionError}
              aria-describedby={
                showDescriptionError ? descriptionErrorId : undefined
              }
              className={`w-full min-h-[120px] resize-y rounded-[14px] border-[1.5px] bg-field-bg px-4 py-3.5 text-[15px] leading-[1.5] text-ink outline-none placeholder:text-field-placeholder ${
                showDescriptionError ? "border-field-error" : "border-input-border"
              }`}
            />
            {showDescriptionError ? (
              <p
                id={descriptionErrorId}
                className="mt-2 text-xs font-bold text-field-error"
              >
                Escribe una descripción.
              </p>
            ) : null}
          </div>

          <div className="mb-2">
            <div className="mb-2.5 flex items-center justify-between text-xs font-extrabold tracking-[0.7px] text-muted-strong">
              <span>FOTOS</span>
              <span className="text-[12px] font-bold text-muted">
                {files.length}/{MAX_PHOTOS}
              </span>
            </div>
            <div className="flex flex-wrap gap-3">
              {previews.map((preview, index) => (
                <div
                  key={preview.url}
                  className="relative h-24 w-24 overflow-hidden rounded-[14px] border border-photo-tile-border bg-photo-tile-bg"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    aria-label={`Quitar ${preview.name}`}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(63,54,46,0.85)] text-xs font-extrabold text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
              {files.length < MAX_PHOTOS ? (
                <label
                  htmlFor={fileInputId}
                  className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-photo-tile-add-border bg-photo-tile-bg text-photo-tile-add-fg"
                >
                  <ImagePlusIcon className="h-[22px] w-[22px] text-accent-deep" />
                  <span className="text-xs">Agregar</span>
                </label>
              ) : (
                <div className="flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-photo-tile-add-border bg-photo-tile-bg text-photo-tile-add-fg">
                  <PhotoIcon className="h-[22px] w-[22px]" />
                  <span className="text-xs">Máximo</span>
                </div>
              )}
              <input
                ref={fileInputRef}
                id={fileInputId}
                type="file"
                name="files"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/avif,image/bmp"
                onChange={handleFiles}
                className="sr-only"
              />
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}