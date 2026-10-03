"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImagePlusIcon, PhotoIcon } from "@/components/shared/icons";
import type { Kid } from "../kids/mockKids";
import type { PostKind } from "./mockPosts";

type NewPostModalProps = {
  open: boolean;
  kids: Kid[];
  onClose: () => void;
  publish: (input: {
    kind: PostKind;
    body: string;
    kids: Kid[];
    allRoom: boolean;
  }) => void;
};

const KINDS: { value: PostKind; label: string }[] = [
  { value: "comida", label: "Comida" },
  { value: "siesta", label: "Siesta" },
  { value: "actividad", label: "Actividad" },
  { value: "logro", label: "Logro" },
  { value: "animo", label: "Ánimo" },
  { value: "foto", label: "Foto" },
  { value: "anuncio", label: "Anuncio" },
];

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

export function NewPostModal({ open, kids, onClose, publish }: NewPostModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allRoom, setAllRoom] = useState(false);
  const [kind, setKind] = useState<PostKind>("actividad");
  const [body, setBody] = useState("");
  const [attempted, setAttempted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      cardRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const hasRecipient = allRoom || selectedIds.length > 0;
  const bodyInvalid = body.trim().length === 0;
  const showRecipientError = attempted && !hasRecipient;
  const showBodyError = attempted && bodyInvalid;

  function toggleKid(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((kidId) => kidId !== id) : [...prev, id],
    );
  }

  function toggleAllRoom() {
    setAllRoom((prev) => !prev);
    setSelectedIds([]);
  }

  function resetFields() {
    setSelectedIds([]);
    setAllRoom(false);
    setKind("actividad");
    setBody("");
    setAttempted(false);
  }

  function handlePublish() {
    if (!hasRecipient || bodyInvalid) {
      setAttempted(true);
      return;
    }
    publish({
      kind,
      body,
      kids: kids.filter((kid) => selectedIds.includes(kid.id)),
      allRoom,
    });
    resetFields();
  }

  const visibleKids = allRoom ? [] : kids;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
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
            onClick={onClose}
            className="text-[15px] font-bold text-muted-strong"
          >
            Cancelar
          </button>
          <span className="font-display text-[18px] font-semibold text-ink">
            Nueva publicación
          </span>
          <button
            type="button"
            onClick={handlePublish}
            className="text-[15px] font-extrabold text-accent"
          >
            Publicar
          </button>
        </header>

        <div className="overflow-y-auto px-[26px] py-6">
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
            {showRecipientError ? (
              <p className="mt-2 text-xs font-bold text-field-error">
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
          </div>

          <div className="mb-[22px]">
            <div className="mb-2.5 text-xs font-extrabold tracking-[0.7px] text-muted-strong">
              DESCRIPCIÓN
            </div>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Cuenta cómo le fue hoy…"
              aria-invalid={showBodyError}
              className={`w-full min-h-[120px] resize-y rounded-[14px] border-[1.5px] bg-field-bg px-4 py-3.5 text-[15px] leading-[1.5] text-ink outline-none placeholder:text-field-placeholder ${
                showBodyError ? "border-field-error" : "border-input-border"
              }`}
            />
            {showBodyError ? (
              <p className="mt-2 text-xs font-bold text-field-error">
                Escribe una descripción.
              </p>
            ) : null}
          </div>

          <div className="mb-2">
            <div className="mb-2.5 text-xs font-extrabold tracking-[0.7px] text-muted-strong">
              FOTOS
            </div>
            <div className="flex gap-3">
              <div className="flex h-24 w-24 items-center justify-center rounded-[14px] border border-photo-tile-border bg-photo-tile-bg text-chevron-ink">
                <PhotoIcon className="h-[26px] w-[26px]" />
              </div>
              <div className="flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-photo-tile-add-border bg-photo-tile-bg text-photo-tile-add-fg">
                <ImagePlusIcon className="h-[22px] w-[22px] text-accent-deep" />
                <span className="text-xs">Agregar</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
