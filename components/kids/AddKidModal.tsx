"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "../shared/icons";
import { applyDateMask, ageFromBirthDate, parseSpanishDate } from "./dateMask";
import {
  AVATAR_PALETTE,
  SALAS,
  buildKidId,
  type AllergyTag,
  type Kid,
  type Sala,
} from "./mockKids";

type AddKidModalProps = {
  open: boolean;
  addedCount: number;
  onClose: () => void;
  onSave: (kid: Kid) => void;
};

const FIELD_CLASSES =
  "w-full rounded-[14px] border-[1.5px] border-input-border bg-field-bg px-4 py-[13px] text-[15px] text-ink outline-none placeholder:text-field-placeholder";

function mapAllergy(raw: string): AllergyTag | undefined {
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized.includes("mani")) {
    return "maní";
  }
  if (normalized.includes("lactosa")) {
    return "lactosa";
  }
  return undefined;
}

function buildKid({
  name,
  birthDate,
  sala,
  allergies,
  medicalNotes,
  addedCount,
}: {
  name: string;
  birthDate: string;
  sala: Sala;
  allergies: string;
  medicalNotes: string;
  addedCount: number;
}): Kid {
  const trimmedName = name.trim();
  const parsedBirthDate = parseSpanishDate(birthDate);

  return {
    id: buildKidId(trimmedName),
    name: trimmedName,
    initials: trimmedName.charAt(0).toUpperCase(),
    avatar: AVATAR_PALETTE[addedCount % AVATAR_PALETTE.length],
    age: parsedBirthDate ? ageFromBirthDate(parsedBirthDate) : 0,
    sala,
    parentsCount: 0,
    parents: [],
    birthDate,
    allergy: mapAllergy(allergies),
    allergyNotes: allergies.trim() || undefined,
    medicalNotes: medicalNotes.trim() || undefined,
  };
}

export function AddKidModal({ open, addedCount, onClose, onSave }: AddKidModalProps) {
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sala, setSala] = useState<Sala>("Soles");
  const [allergies, setAllergies] = useState("");
  const [medicalNotes, setMedicalNotes] = useState("");

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

  if (!open) {
    return null;
  }

  const canSave = name.trim() !== "" && parseSpanishDate(birthDate) !== null;

  function resetFields() {
    setName("");
    setBirthDate("");
    setSala("Soles");
    setAllergies("");
    setMedicalNotes("");
  }

  function handleSave() {
    if (!canSave) {
      return;
    }
    onSave(
      buildKid({ name, birthDate, sala, allergies, medicalNotes, addedCount })
    );
    resetFields();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Agregar niño"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[calc(100dvh-32px)] w-full max-w-[520px] flex-col overflow-hidden rounded-[24px] border border-border bg-modal-bg shadow-modal"
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
            Agregar niño
          </span>
          <button
            type="button"
            disabled={!canSave}
            onClick={handleSave}
            className="text-[15px] font-extrabold text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            Guardar
          </button>
        </header>

        <div className="overflow-y-auto px-[26px] py-6">
          <div className="mb-2 text-xs font-extrabold tracking-[0.7px] text-muted-strong">
            NOMBRE COMPLETO
          </div>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ej. Martina López"
            className={`${FIELD_CLASSES} mb-[18px]`}
          />

          <div className="mb-[18px] flex gap-[14px]">
            <div className="flex-1">
              <div className="mb-2 text-xs font-extrabold tracking-[0.7px] text-muted-strong">
                FECHA DE NACIMIENTO
              </div>
              <input
                value={birthDate}
                onChange={(event) => setBirthDate(applyDateMask(event.target.value))}
                placeholder="dd/mm/aaaa"
                inputMode="numeric"
                maxLength={10}
                className={FIELD_CLASSES}
              />
            </div>
            <div className="flex-1">
              <div className="mb-2 text-xs font-extrabold tracking-[0.7px] text-muted-strong">
                SALA
              </div>
              <div className="relative">
                <select
                  value={sala}
                  onChange={(event) => setSala(event.target.value as Sala)}
                  className="w-full appearance-none rounded-[14px] border-[1.5px] border-input-border bg-field-bg py-[13px] pl-4 pr-9 text-[15px] font-bold text-ink outline-none"
                >
                  {SALAS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-field-chevron" />
              </div>
            </div>
          </div>

          <div className="mb-2 text-xs font-extrabold tracking-[0.7px] text-muted-strong">
            ALERGIAS (ETIQUETAS)
          </div>
          <input
            value={allergies}
            onChange={(event) => setAllergies(event.target.value)}
            placeholder="Ej. Maní, Lactosa"
            className={`${FIELD_CLASSES} mb-[18px]`}
          />

          <div className="mb-2 text-xs font-extrabold tracking-[0.7px] text-muted-strong">
            NOTAS MÉDICAS
          </div>
          <textarea
            value={medicalNotes}
            onChange={(event) => setMedicalNotes(event.target.value)}
            placeholder="Indicaciones, medicación, contactos…"
            className={`${FIELD_CLASSES} min-h-[90px] resize-y leading-[1.5]`}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
