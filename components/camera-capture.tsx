"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, SwitchCamera, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type Shot = { key: string; file: File; url: string };

/**
 * Bouton « Prendre des photos » : ouvre la caméra dans l'application et permet
 * de prendre plusieurs photos à la suite, puis « Terminé » les transmet toutes.
 * Si la caméra n'est pas accessible (permission refusée, navigateur ancien),
 * l'appareil photo du téléphone est proposé, une photo à la fois, autant de fois que voulu.
 */
export function CameraCaptureButton({ onCapture, size = "sm", label = "Prendre des photos" }: { onCapture: (files: File[]) => void; size?: "sm" | "default"; /** clé de traduction */ label?: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size={size} onClick={() => setOpen(true)}>
        <Camera /> {t(label)}
      </Button>
      {open && (
        <CameraDialog
          onClose={() => setOpen(false)}
          onDone={(files) => {
            setOpen(false);
            if (files.length) onCapture(files);
          }}
        />
      )}
    </>
  );
}

function CameraDialog({ onClose, onDone }: { onClose: () => void; onDone: (files: File[]) => void }) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [status, setStatus] = useState<"starting" | "live" | "unavailable">("starting");
  const [shots, setShots] = useState<Shot[]>([]);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unavailable");
        return;
      }
      setStatus("starting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setStatus("live");
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    }
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    };
  }, [facing]);

  const addFiles = (files: File[]) => setShots((prev) => [...prev, ...files.map((file) => ({ key: crypto.randomUUID(), file, url: URL.createObjectURL(file) }))]);

  const takeShot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        addFiles([new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" })]);
        setFlash(true);
        setTimeout(() => setFlash(false), 120);
      },
      "image/jpeg",
      0.9,
    );
  };

  const removeShot = (key: string) =>
    setShots((prev) => {
      const s = prev.find((x) => x.key === key);
      if (s) URL.revokeObjectURL(s.url);
      return prev.filter((x) => x.key !== key);
    });

  const cancel = () => {
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && cancel()}>
      <DialogContent className="max-h-[98vh] gap-3 p-3 sm:max-w-2xl">
        <DialogTitle>{t("Prendre des photos")}</DialogTitle>

        {status !== "unavailable" ? (
          <div className="relative overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} playsInline muted className="aspect-[4/3] max-h-[55vh] w-full object-contain" />
            {status === "starting" && (
              <div className="absolute inset-0 flex items-center justify-center text-white">
                <Loader2 className="size-8 animate-spin" />
              </div>
            )}
            {flash && <div className="absolute inset-0 bg-white/70" />}
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border border-dashed p-4 text-center text-sm">
            <p className="text-muted-foreground">{t("Caméra non accessible dans l'application (autorisation refusée ou navigateur non compatible). Utilisez l'appareil photo du téléphone : une photo à chaque appui, autant de fois que nécessaire.")}</p>
            <Button type="button" onClick={() => nativeRef.current?.click()}>
              <Camera /> {shots.length ? t("Prendre une autre photo") : t("Ouvrir l'appareil photo")}
            </Button>
            <input
              ref={nativeRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
          </div>
        )}

        {shots.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {shots.map((s) => (
              <div key={s.key} className="relative size-16 shrink-0 overflow-hidden rounded-md border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.url} alt="" className="size-full object-cover" />
                <button type="button" aria-label={t("Supprimer")} className="absolute end-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white" onClick={() => removeShot(s.key)}>
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={cancel}>
            {t("Annuler")}
          </Button>
          {status === "live" && (
            <>
              <Button type="button" variant="outline" size="icon" aria-label={t("Changer de caméra")} onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}>
                <SwitchCamera />
              </Button>
              <button
                type="button"
                aria-label={t("Prendre la photo")}
                onClick={takeShot}
                className="mx-auto size-16 rounded-full border-4 border-primary bg-white shadow-md transition active:scale-90"
              />
            </>
          )}
          <Button type="button" className="ms-auto" disabled={shots.length === 0} onClick={() => {
              shots.forEach((s) => URL.revokeObjectURL(s.url));
              onDone(shots.map((s) => s.file));
            }}>
            <Check /> {t("Terminé ({count})", { count: shots.length })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
