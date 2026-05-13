import { useCallback, useState } from "react";
import { uploadStarterCards } from "../types/cardService";
import type { Player } from "../types/game";
import { AURA_COLORS, FALLBACK_AVATAR } from "./gameConstants";
import AdminDialog from "./AdminDialog";
import { ru } from "../i18n/ru";
import type { ToastNotification } from "./useModalStates";

type ProfileSidebarProps = {
  isOpen: boolean;
  playerData: Player;
  isAdmin: boolean;
  onClose: () => void;
  onOpenLegends: () => void;
  onOpenCollection: () => void;
  onUpdateLogin: (value: string) => void | Promise<void>;
  onUpdateBorderColor: (color: string) => void | Promise<void>;
  onUpdateAvatar: (url: string) => void | Promise<void>;
  onResetGame: () => void | Promise<void>;
  onLogout: () => void | Promise<void>;
  notify: (message: string, type?: ToastNotification["type"], cardId?: string) => void;
};

function ProfileSidebar({
  isOpen,
  playerData,
  isAdmin,
  onClose,
  onOpenLegends,
  onOpenCollection,
  onUpdateLogin,
  onUpdateBorderColor,
  onUpdateAvatar,
  onResetGame,
  onLogout,
  notify,
}: ProfileSidebarProps) {
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [newAvatarUrl, setNewAvatarUrl] = useState("");
  const [isAdminActionPending, setIsAdminActionPending] = useState(false);
  const [adminDialog, setAdminDialog] = useState<{
    title: string;
    message: string;
    danger?: boolean;
    onConfirm?: () => void | Promise<void>;
  } | null>(null);

  const runAdminAction = useCallback(async (action: () => void | Promise<void>) => {
    if (isAdminActionPending) return;
    setIsAdminActionPending(true);
    try {
      await action();
    } catch (error) {
      console.error(error);
      notify("Не удалось выполнить админское действие.", "error");
    } finally {
      setIsAdminActionPending(false);
    }
  }, [isAdminActionPending, notify]);

  const handleConfirmAvatar = () => {
    void onUpdateAvatar(newAvatarUrl);
    setIsAvatarModalOpen(false);
    setNewAvatarUrl("");
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 right-0 h-full w-80 backdrop-blur-xl border-l border-yellow-500/20 p-6 pt-24 flex flex-col gap-8 z-[70] transform transition-transform duration-500 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ fontFamily: "'Comfortaa', sans-serif" }}
      >
        <div className="flex justify-end -mr-2 -mt-2">
          <button
            onClick={onClose}
            title="Закрыть панель управления"
            className="text-zinc-500 hover:text-white hover:scale-110 active:scale-90 transition-all p-2 text-2xl font-light"
          >
            x
          </button>
        </div>

        <div className="flex flex-col items-center gap-6">
          <div
            className="relative p-1 rounded-full transition-all duration-500 shadow-2xl"
            style={{ background: playerData.borderColor || "#fac319" }}
          >
            <img
              src={playerData.avatar || FALLBACK_AVATAR}
              onClick={() => setIsAvatarModalOpen(true)}
              className="w-28 h-28 rounded-full cursor-pointer object-cover border-4 border-black hover:opacity-80 transition-opacity"
              title="Нажмите, чтобы изменить аватар"
            />
          </div>

          <div className="flex flex-col gap-5 w-full">
            <div className="flex flex-col gap-2">
              <label htmlFor="nickname-input" className="text-[10px] uppercase font-black text-zinc-500 tracking-[0.2em] px-1">Ваш позывной</label>
              <input
                id="nickname-input"
                key={playerData.id + playerData.login}
                defaultValue={playerData.login}
                onBlur={(e) => void onUpdateLogin(e.target.value)}
                placeholder="Введите ник"
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className="bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-white font-bold focus:border-yellow-500/50 outline-none transition-all shadow-inner"
              />
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-[10px] uppercase font-black text-zinc-500 tracking-[0.2em] px-1">Цвет ауры</label>
              <div className="flex gap-2.5 flex-wrap px-1">
                {AURA_COLORS.map(color => (
                  <button
                    key={color}
                    title={`Выбрать цвет ауры: ${color}`}
                    onClick={() => void onUpdateBorderColor(color)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${playerData.borderColor === color ? "border-white scale-110 shadow-lg" : "border-transparent opacity-50 hover:opacity-100 hover:scale-105"}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>

              <button
                onClick={() => {
                  onOpenLegends();
                  onClose();
                }}
                className="w-full py-4 mt-4 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl flex items-center justify-center gap-3 group hover:bg-yellow-500/20 transition-all active:scale-95"
              >
                <span className="text-xl group-hover:rotate-12 transition-transform">★</span>
                <span className="text-yellow-500 font-black uppercase text-xs tracking-widest">Коллекция Легенд</span>
              </button>

              <button
                onClick={() => {
                  onOpenCollection();
                  onClose();
                }}
                className="w-full py-4 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl flex items-center justify-center gap-3 group hover:bg-yellow-500/20 transition-all active:scale-95"
              >
                <span className="text-xl group-hover:rotate-12 transition-transform">◇</span>
                <span className="text-yellow-500 font-black uppercase text-xs tracking-widest">Галерея Артефактов</span>
              </button>

              {isAdmin && (
                <div className="mt-2 flex flex-col gap-2 rounded-2xl border border-red-500/20 bg-red-950/10 p-3">
                  <div className="px-1 text-[10px] font-black uppercase tracking-[0.2em] text-red-300/80">
                    Админ
                  </div>
                  <button
                    onClick={() => void runAdminAction(async () => {
                      await uploadStarterCards();
                      notify(ru.bottomPanel.initCardsSuccess, "success");
                    })}
                    disabled={isAdminActionPending}
                    className="w-full rounded-xl border border-blue-500/30 bg-slate-900/80 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-blue-300 transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Init
                  </button>
                  <button
                    onClick={() => {
                      setAdminDialog({
                        title: ru.bottomPanel.resetTitle,
                        message: ru.bottomPanel.resetConfirm,
                        danger: true,
                        onConfirm: () => runAdminAction(onResetGame),
                      });
                    }}
                    disabled={isAdminActionPending}
                    className="w-full rounded-xl border border-red-500/40 bg-red-950/70 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-red-300 transition-all hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-yellow-500/20 pt-4 mt-auto">
          <button
            onClick={() => void onLogout()}
            className="w-full px-4 py-2 bg-red-900/40 border border-red-500/30 text-red-300 rounded-lg hover:bg-red-900/60 hover:scale-[1.02] active:scale-95 transition-all"
          >
            Выйти
          </button>
        </div>
      </aside>

      <AdminDialog
        isOpen={Boolean(adminDialog)}
        variant={adminDialog?.onConfirm ? "confirm" : "info"}
        title={adminDialog?.title ?? ""}
        message={adminDialog?.message}
        confirmLabel={adminDialog?.onConfirm ? ru.bottomPanel.confirm : ru.bottomPanel.ok}
        cancelLabel={ru.bottomPanel.cancel}
        danger={adminDialog?.danger}
        onClose={() => setAdminDialog(null)}
        onConfirm={() => {
          const action = adminDialog?.onConfirm;
          setAdminDialog(null);
          if (action) void action();
        }}
      />

      {isAvatarModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[10001] p-4">
          <div className="bg-zinc-950 border border-yellow-500/30 p-8 rounded-[2.5rem] w-full max-w-sm flex flex-col gap-6 shadow-2xl animate-in zoom-in duration-300" style={{ fontFamily: "'Comfortaa', sans-serif" }}>
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-black text-yellow-500 uppercase italic tracking-tighter">Сменить аватар</h2>
              <p className="text-xs text-zinc-500">Введите прямую ссылку на изображение</p>
            </div>

            <div className="flex flex-col gap-2">
              <input
                value={newAvatarUrl}
                title="URL вашего изображения"
                onChange={(e) => setNewAvatarUrl(e.target.value)}
                placeholder="https://i.pinimg.com/..."
                className="w-full p-4 bg-black/50 border border-white/10 rounded-2xl text-white outline-none focus:border-yellow-500/50 transition-all font-bold placeholder:text-zinc-700"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleConfirmAvatar}
                className="flex-1 bg-yellow-500 text-black py-4 rounded-2xl font-black uppercase text-sm hover:bg-white transition-all active:scale-95 shadow-[0_5px_0_#a16207] active:shadow-none active:translate-y-1"
              >
                Принять
              </button>
              <button
                onClick={() => setIsAvatarModalOpen(false)}
                className="flex-1 bg-zinc-800 text-zinc-400 py-4 rounded-2xl font-bold uppercase text-sm hover:text-white transition-all"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ProfileSidebar;
