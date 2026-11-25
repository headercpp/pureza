import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const EASE = [0.22, 0.61, 0.36, 1] as const;

export default function Intro({ onDone }: { onDone: () => void }) {
  const [scene, setScene] = useState(0);
  const total = 4;

  useEffect(() => {
    if (scene >= total) return;
    const dur = scene === 0 ? 2800 : scene === total - 1 ? 60000 : 3600;
    const t = window.setTimeout(() => {
      if (scene < total - 1) setScene(scene + 1);
    }, dur);
    return () => window.clearTimeout(t);
  }, [scene]);

  return (
    <motion.div
      className="intro"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.6 } }}
      transition={{ duration: 0.4 }}
    >
      <div className="intro-bg">
        <motion.div className="intro-blob a" animate={{ x: [0, 30, -20, 0], y: [0, -20, 30, 0] }} transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="intro-blob b" animate={{ x: [0, -40, 20, 0], y: [0, 30, -20, 0] }} transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="intro-blob c" animate={{ x: [0, 20, -30, 0], y: [0, 40, -10, 0] }} transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }} />
      </div>

      <AnimatePresence mode="wait">
        {scene === 0 && (
          <motion.div key="s0" className="intro-scene" exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.5, ease: EASE }}>
            <motion.div
              className="intro-logo"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1.2, ease: EASE }}
            >
              <svg viewBox="0 0 120 120">
                <defs>
                  <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#fff" />
                    <stop offset="1" stopColor="#999" />
                  </linearGradient>
                </defs>
                <motion.circle cx="60" cy="60" r="50" fill="none" stroke="url(#logo-g)" strokeWidth="2.5"
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, delay: 0.2, ease: EASE }} />
                <motion.path d="M38 60 l16 16 l30 -30" fill="none" stroke="url(#logo-g)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, delay: 1.1, ease: EASE }} />
              </svg>
            </motion.div>
            <motion.h1
              className="intro-title"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 1.4, ease: EASE }}
            >
              Pureza
            </motion.h1>
          </motion.div>
        )}

        {scene === 1 && (
          <motion.div key="s1" className="intro-scene" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.7, ease: EASE }}>
            <motion.div className="intro-eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.5 }}>
              O que o Pureza faz
            </motion.div>
            <motion.h2 className="intro-headline" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.8, ease: EASE }}>
              Desinstala <em>profundo</em>.
              <br />
              Limpa o que fica <em>pra trás</em>.
            </motion.h2>
          </motion.div>
        )}

        {scene === 2 && (
          <motion.div key="s2" className="intro-scene" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.7, ease: EASE }}>
            <motion.div className="intro-eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.5 }}>
              Tudo num lugar
            </motion.div>
            <div className="intro-pillars">
              {[
                { t: "Registro", d: "Chaves órfãs em HKCU e HKLM" },
                { t: "Arquivos", d: "AppData, Program Files, Temp" },
                { t: "Serviços", d: "Services e tarefas agendadas" },
                { t: "Inicialização", d: "O que sobe com o Windows" },
                { t: "Disco", d: "O que mais ocupa espaço" },
                { t: "Shredder", d: "Apagar sem recuperação" },
              ].map((p, i) => (
                <motion.div
                  key={p.t}
                  className="intro-pillar"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.09, duration: 0.6, ease: EASE }}
                >
                  <div className="intro-pillar-t">{p.t}</div>
                  <div className="intro-pillar-d">{p.d}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {scene === 3 && (
          <motion.div key="s3" className="intro-scene" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.7, ease: EASE }}>
            <motion.h2 className="intro-headline" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.8, ease: EASE }}>
              Simples por fora.
              <br />
              <em>Profundo por dentro.</em>
            </motion.h2>
            <motion.button
              className="intro-cta"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.6, ease: EASE }}
              onClick={onDone}
            >
              Começar
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="intro-dots">
        {Array.from({ length: total }).map((_, i) => (
          <button key={i} className={"intro-dot " + (i === scene ? "on" : "")} onClick={() => setScene(i)} aria-label={`Cena ${i + 1}`} />
        ))}
      </div>

      <button className="intro-skip" onClick={onDone}>Pular</button>
    </motion.div>
  );
}
