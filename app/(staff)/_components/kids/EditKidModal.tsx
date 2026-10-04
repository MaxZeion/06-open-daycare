"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "@/components/shared/icons";
import {
  updateKid,
  type UpdateKidState,
} from "@/app/(staff)/kids/actions";
import { applyDateMask, parseSpanishDate } from "./dateMask";
import { validateFullName, type RoomOption } from "./mapKid";
import type { Kid } from "./mockKids";

const FIELD_CLASSES =
  "w-full rounded-[14px] border-[1.5px] bg-field-bg px-4 py-[13px] text-[15px] text-ink outline-none placeholder:text-field-placeholder";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const INITIAL_STATE: UpdateKidState = {};

export type EditKidInitialValues = {
  fullName: string;
  birthDate: string;
  roomId: string;
  allergies: string;
  medicalNotes: string;
};

export type EditKidModalProps = {
  kid: Kid;
  rooms: RoomOption[];
  initialValues: EditKidInitialValues;
  onClose: () => void;
};

export function EditKidModal({
  kid,
  rooms,
  initialValues,
  onClose,
}: EditKidModalProps) {
  const [state, formAction, isPending] = useActionState<UpdateKidState, FormData>(
    updateKid,
    INITIAL_STATE,
  );
  const [name, setName] = useState(initialValues.fullName);
  const [birthDate, setBirthDate] = useState(initialValues.birthDate);
  const [roomId, setRoomId] = useState(initialValues.roomId);
  const [allergies, setAllergies] = useState(initialValues.allergies);
  const [medicalNotes, setMedicalNotes] = useState(initialValues.medicalNotes);
  const [attempted, setAttempted] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closedOnSuccess = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const reactId = useId();
  const ids = {
    fullName: `${reactId}-full_name`,
    fullNameError: `${reactId}-full_name-error`,
    birthDate: `${reactId}-birth_date`,
    birthDateError: `${reactId}-birth_date-error`,
    roomId: `${reactId}-room_id`,
    allergies: `${reactId}-allergies`,
    medicalNotes: `${reactId}-medical_notes`,
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (state.ok && !closedOnSuccess.current) {
      closedOnSuccess.current = true;
      onCloseRef.current();
    }
  }, [state]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    const dialog = dialogRef.current;
    const focusables = dialog
      ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      : [];
    focusables[0]?.focus();
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const nameError = validateFullName(name);
  const dateError =
    birthDate.length === 0
      ? "Completa la fecha (dd/mm/aaaa)."
      : parseSpanishDate(birthDate) === null
        ? "Fecha no válida."
        : null;
  const showNameError = attempted && nameError !== null;
  const showDateError = attempted && dateError !== null;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (nameError !== null || dateError !== null) {
      event.preventDefault();
      setAttempted(true);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Editar ${kid.name}`}
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
            Editar niño
          </span>
          <button
            type="submit"
            form="edit-kid-form"
            disabled={isPending}
            aria-busy={isPending}
            className="text-[15px] font-extrabold text-accent disabled:opacity-60"
          >
            {isPending ? "Guardando…" : "Guardar"}
          </button>
        </header>

        <form
          id="edit-kid-form"
          action={formAction}
          onSubmit={handleSubmit}
          noValidate
          className="overflow-y-auto px-[26px] py-6"
        >
          <input type="hidden" name="child_id" value={kid.id} />

          {state.error ? (
            <p
              role="alert"
              className="mb-4 rounded-[12px] bg-alert-box-bg px-4 py-3 text-[13.5px] font-bold text-alert-title"
            >
              {state.error}
            </p>
          ) : null}

          <div className="mb-[18px]">
            <label
              htmlFor={ids.fullName}
              className="mb-2 block text-xs font-extrabold tracking-[0.7px] text-muted-strong"
            >
              NOMBRE COMPLETO
            </label>
            <input
              id={ids.fullName}
              name="full_name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej. Martina López"
              aria-invalid={showNameError}
              aria-describedby={showNameError ? ids.fullNameError : undefined}
              aria-required="true"
              className={`${FIELD_CLASSES} ${
                showNameError ? "border-field-error" : "border-input-border"
              }`}
            />
            {showNameError ? (
              <p
                id={ids.fullNameError}
                className="mt-2 text-xs font-bold text-field-error"
              >
                {nameError}
              </p>
            ) : null}
          </div>

          <div className="mb-[18px] flex gap-[14px]">
            <div className="flex-1">
              <label
                htmlFor={ids.birthDate}
                className="mb-2 block text-xs font-extrabold tracking-[0.7px] text-muted-strong"
              >
                FECHA DE NACIMIENTO
              </label>
              <input
                id={ids.birthDate}
                name="birth_date"
                value={birthDate}
                onChange={(event) => setBirthDate(applyDateMask(event.target.value))}
                placeholder="dd/mm/aaaa"
                inputMode="numeric"
                maxLength={10}
                aria-invalid={showDateError}
                aria-describedby={showDateError ? ids.birthDateError : undefined}
                aria-required="true"
                className={`${FIELD_CLASSES} ${
                  showDateError ? "border-field-error" : "border-input-border"
                }`}
              />
              {showDateError ? (
                <p
                  id={ids.birthDateError}
                  className="mt-2 text-xs font-bold text-field-error"
                >
                  {dateError}
                </p>
              ) : null}
            </div>
            <div className="flex-1">
              <label
                htmlFor={ids.roomId}
                className="mb-2 block text-xs font-extrabold tracking-[0.7px] text-muted-strong"
              >
                SALA
              </label>
              <div className="relative">
                <select
                  id={ids.roomId}
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
            <label
              htmlFor={ids.allergies}
              className="mb-2 block text-xs font-extrabold tracking-[0.7px] text-muted-strong"
            >
              ALERGIAS (ETIQUETAS)
            </label>
            <input
              id={ids.allergies}
              name="allergies"
              value={allergies}
              onChange={(event) => setAllergies(event.target.value)}
              placeholder="Ej. Maní, Lactosa"
              className={`${FIELD_CLASSES} border-input-border`}
            />
          </div>

          <div className="mb-2">
            <label
              htmlFor={ids.medicalNotes}
              className="mb-2 block text-xs font-extrabold tracking-[0.7px] text-muted-strong"
            >
              NOTAS MÉDICAS
            </label>
            <textarea
              id={ids.medicalNotes}
              name="medical_notes"
              value={medicalNotes}
              onChange={(event) => setMedicalNotes(event.target.value)}
              placeholder="Indicaciones, medicación, contactos…"
              className={`${FIELD_CLASSES} min-h-[90px] resize-y leading-[1.5] border-input-border`}
            />
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}