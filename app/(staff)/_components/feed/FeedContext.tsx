"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Kid } from "../kids/mockKids";
import { NewPostModal } from "./NewPostModal";

interface FeedContextValue {
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const FeedContext = createContext<FeedContextValue | null>(null);

export function FeedProvider({
  kids,
  children,
}: {
  kids: Kid[];
  children: ReactNode;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  const openModal = useCallback(() => setModalOpen(true), []);
  const closeModal = useCallback(() => setModalOpen(false), []);

  const value = useMemo(
    () => ({ modalOpen, openModal, closeModal }),
    [modalOpen, openModal, closeModal],
  );

  return (
    <FeedContext.Provider value={value}>
      {children}
      <NewPostModal kids={kids} />
    </FeedContext.Provider>
  );
}

export function useFeed(): FeedContextValue {
  const context = useContext(FeedContext);
  if (!context) {
    throw new Error("useFeed debe usarse dentro de <FeedProvider>");
  }
  return context;
}