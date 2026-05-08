import { ru } from "../i18n/ru";

function InteractionPendingOverlay() {
  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/10 backdrop-blur-[1px] cursor-wait pointer-events-auto">
      <div className="bg-zinc-900/90 border-2 border-purple-500/50 p-6 rounded-[2rem] flex flex-col items-center gap-4 shadow-[0_0_80px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in-95 duration-200">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
        <div className="flex flex-col items-center text-center">
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-purple-400">{ru.pending.title}</span>
          <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-500 mt-2">{ru.pending.subtitle}</span>
        </div>
      </div>
    </div>
  );
}

export default InteractionPendingOverlay;
