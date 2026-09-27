"use client";

import { useEffect, useActionState, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "../shared/icons";
import { applyDateMask, parseSpanishDate } from "./dateMask";
import { addKid, type AddKidState } from "../../app/kids/actions";
import type { RoomOption } from "./mapKid";

type AddKidModalProps = {
  rooms: RoomOption[];
  defaultRoomId: string;
  onClose: () => void;
};

const FIELD_CLASSES =
  "w-full rounded-[14px] border-[1.5px] bg-field-bg px-4 py-[13px] text-[15px] text-ink outline-none placeholder:text-field-placeholder";

const INITIAL_STATE: AddKidState = {};

export function AddKidModal({ rooms, defaultRoomId, onClose }: AddKidModalProps) {
  const [state, formAction, isPending] = useActionState<AddKidState, FormData>(
    addKid,
    INITIAL_STATE,
  );
  const [isTransitioning, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [roomId, setRoomId] = useState(defaultRoomId);
  const [allergies, setAllergies] = useState("");
  const [medicalNotes, setMedicalNotes] = useState("");
  const [attempted, setAttempted] = useState(false);
  const closedOnSuccess = useRef(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (state.ok && !closedOnSuccess.current) {
      closedOnSuccess.current = true;
      onClose();
    }
  }, [state, onClose]);

  const trimmedName = name.trim();
  const nameParts = trimmedName.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts[1] ?? "";
  const nameInvalid = firstName.length < 3 || lastName.length === 0;
  const dateInvalid = parseSpanishDate(birthDate) === null;
  const showNameError = attempted && nameInvalid;
  const showDateError = attempted && dateInvalid;
  const saving = isPending || isTransitioning;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (nameInvalid || dateInvalid) {
      setAttempted(true);
      return;
    }
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
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
            type="submit"
            form="add-kid-form"
            disabled={saving}
            aria-busy={saving}
            className="text-[15px] font-extrabold text-accent disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </header>

        <form
          id="add-kid-form"
          onSubmit={handleSubmit}
          className="overflow-y-auto px-[26px] py-6"
        >
          {state.error ? (
            <p className="mb-4 rounded-[12px] bg-alert-box-bg px-4 py-3 text-[13.5px] font-bold text-alert-title">
              {state.error}
            </p>
          ) : null}

          <div className="mb-[18px]">
            <div className="mb-2 text-xs font-extrabold tracking-[0.7px] text-muted-strong">
              NOMBRE COMPLETO
            </div>
            <input
              name="full_name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej. Martina López"
              aria-invalid={showNameError}
              className={`${FIELD_CLASSES} ${
                showNameError ? "border-field-error" : "border-input-border"
              }`}
            />
            {showNameError ? (
              <p className="mt-2 text-xs font-bold text-field-error">
                Introduce nombre y apellido (mínimo 3 caracteres en el nombre).
              </p>
            ) : null}
          </div>

          <div className="mb-[18px] flex gap-[14px]">
            <div className="flex-1">
              <div className="mb-2 text-xs font-extrabold tracking-[0.7px] text-muted-strong">
                FECHA DE NACIMIENTO
              </div>
              <input
                name="birth_date"
                value={birthDate}
                onChange={(event) => setBirthDate(applyDateMask(event.target.value))}
                placeholder="dd/mm/aaaa"
                inputMode="numeric"
                maxLength={10}
                aria-invalid={showDateError}
                className={`${FIELD_CLASSES} ${
                  showDateError ? "border-field-error" : "border-input-border"
                }`}
              />
              {showDateError ? (
                <p className="mt-2 text-xs font-bold text-field-error">
                  {birthDate.length < 10
                    ? "Completa la fecha (dd/mm/aaaa)."
                    : "Fecha no válida."}
                </p>
              ) : null}
            </div>
            <div className="flex-1">
              <div className="mb-2 text-xs font-extrabold tracking-[0.7px] text-muted-strong">
                SALA
              </div>
              <div className="relative">
                <select
                  name="room_id"
                  value={roomId}
                  onChange={(event) => setRoomId(event.target.value)}
                  className="w-full appearance-none rounded-[14px] border-[1.5px] border-input-border bg-field-bg py-[13px] pl-4 pr-9 text-[15px] font-bold text-ink outline-none"
                >
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-field-chevron" />
              </div>
            </div>
          </div>

          <div className="mb-[18px]">
            <div className="mb-2 text-xs font-extrabold tracking-[0.7px] text-muted-strong">
              ALERGIAS (ETIQUETAS)
            </div>
            <input
              name="allergies"
              value={allergies}
              onChange={(event) => setAllergies(event.target.value)}
              placeholder="Ej. Maní, Lactosa"
              className={`${FIELD_CLASSES} border-input-border`}
            />
          </div>

          <div className="mb-2 text-xs font-extrabold tracking-[0.7px] text-muted-strong">
            NOTAS MÉDICAS
          </div>
          <textarea
            name="medical_notes"
            value={medicalNotes}
            onChange={(event) => setMedicalNotes(event.target.value)}
            placeholder="Indicaciones, medicación, contactos…"
            className={`${FIELD_CLASSES} min-h-[90px] resize-y leading-[1.5] border-input-border`}
          />
        </form>
      </div>
    </div>,
    document.body
  );
}
