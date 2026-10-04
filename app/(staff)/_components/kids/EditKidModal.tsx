"use client";

import type { Kid } from "./mockKids";

export type EditKidModalProps = {
  kid: Kid;
  onClose: () => void;
};

export function EditKidModal({ kid: _kid, onClose: _onClose }: EditKidModalProps) {
  return null;
}