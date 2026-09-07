/**
 * Optimiza-T con IA · Test Big Five (lead magnet)
 * Prototipo oficial. Flujo: intro → branch → preguntas → email → radiografía.
 *
 * Producción: Netlify Functions (submit-lead → Brevo + email; claude-radiografia → informe IA).
 */
import React, { useState, useRef, useEffect } from "react";

const STORAGE_KEY = "chussama_test_result_v1";
const LEAD_LOG_KEY = "chussama_test_lead_log_v1";

function loadSavedResult() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.result || !data?.answers || !data?.stage) return null;
    return data;
  } catch {
    return null;
  }
}

function saveResult(payload) {
  try {
    const prev = loadSavedResult();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...(prev || {}),
        ...payload,
        savedAt: new Date().toISOString(),
      })
    );
  } catch (err) {
    console.warn("No se pudo guardar el resultado del test:", err);
  }
}

function logLeadFailure(result, payload) {
  const entry = {
    at: new Date().toISOString(),
    status: result.status ?? null,
    error: result.error || "unknown",
    email: payload?.email || "",
    nombre: payload?.nombre || "",
  };
  console.error("[Optimiza-T · Test Big Five] submit-lead falló:", entry);
  try {
    const prev = JSON.parse(localStorage.getItem(LEAD_LOG_KEY) || "[]");
    prev.push(entry);
    localStorage.setItem(LEAD_LOG_KEY, JSON.stringify(prev.slice(-10)));
  } catch {
    /* ignore */
  }
}

async function submitLead(payload) {
  if (!CONFIG.webhookLead) {
    return { ok: false, error: "webhook not configured" };
  }
  try {
    const res = await fetch(CONFIG.webhookLead, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let body = {};
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    if (res.ok) return { ok: true };
    const error = body.detail || body.error || `HTTP ${res.status}`;
    return { ok: false, status: res.status, error };
  } catch (err) {
    return { ok: false, error: err.message || "network error" };
  }
}

async function retryPendingLead() {
  const saved = loadSavedResult();
  if (!saved?.leadPending || !saved?.leadPayload) return;
  const leadResult = await submitLead(saved.leadPayload);
  if (leadResult.ok) {
    saveResult({
      ...saved,
      leadPending: false,
      leadLastError: null,
      leadSentAt: new Date().toISOString(),
    });
    console.info("[Optimiza-T · Test Big Five] submit-lead reintentado con éxito:", saved.leadPayload.email);
    return;
  }
  logLeadFailure(leadResult, saved.leadPayload);
  saveResult({
    ...saved,
    leadLastError: leadResult.error,
    leadLastAttemptAt: new Date().toISOString(),
    leadAttempts: (saved.leadAttempts || 1) + 1,
  });
}

async function submitInforme(payload) {
  if (!CONFIG.sendInforme) {
    return { ok: false, error: "send-informe not configured" };
  }
  try {
    const res = await fetch(CONFIG.sendInforme, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let body = {};
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    if (res.ok) return { ok: true };
    const error = body.detail || body.error || `HTTP ${res.status}`;
    return { ok: false, status: res.status, error };
  } catch (err) {
    return { ok: false, error: err.message || "network error" };
  }
}

function logInformeFailure(result, payload) {
  const entry = {
    at: new Date().toISOString(),
    status: result.status ?? null,
    error: result.error || "unknown",
    email: payload?.email || "",
    nombre: payload?.nombre || "",
  };
  console.error("[Optimiza-T · Test Big Five] send-informe falló:", entry);
  try {
    const prev = JSON.parse(localStorage.getItem(LEAD_LOG_KEY) || "[]");
    prev.push({ ...entry, type: "informe" });
    localStorage.setItem(LEAD_LOG_KEY, JSON.stringify(prev.slice(-10)));
  } catch {
    /* ignore */
  }
}

async function retryPendingInforme() {
  const saved = loadSavedResult();
  if (!saved?.informePending || !saved?.informePayload) return;
  const informeResult = await submitInforme(saved.informePayload);
  if (informeResult.ok) {
    saveResult({
      ...saved,
      informePending: false,
      informeLastError: null,
      informeSentAt: new Date().toISOString(),
    });
    console.info("[Optimiza-T · Test Big Five] send-informe reintentado con éxito:", saved.informePayload.email);
    return;
  }
  logInformeFailure(informeResult, saved.informePayload);
  saveResult({
    ...saved,
    informeLastError: informeResult.error,
    informeLastAttemptAt: new Date().toISOString(),
    informeAttempts: (saved.informeAttempts || 1) + 1,
  });
}

async function retryPendingOperations() {
  await retryPendingLead();
  await retryPendingInforme();
}

function clearSavedResult() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function isResultUrl() {
  return new URLSearchParams(window.location.search).get("resultado") === "1";
}

function setResultUrl(active, { replace = false } = {}) {
  const url = new URL(window.location.href);
  if (active) url.searchParams.set("resultado", "1");
  else url.searchParams.delete("resultado");
  const next = url.pathname + url.search + url.hash;
  if (replace) window.history.replaceState({ chussamaTest: active ? "result" : "intro" }, "", next);
  else window.history.pushState({ chussamaTest: active ? "result" : "intro" }, "", next);
}

function applySavedResult(saved, setters) {
  setters.setStage(saved.stage);
  setters.setAnswers(saved.answers);
  setters.setProfession(saved.profession || "");
  setters.setEmail(saved.email || "");
  setters.setName(saved.name || "");
  setters.setResult(saved.result);
  setters.setInformeSource(saved.informeSource || null);
  setters.setScreen("result");
  setters.setError(null);
  setters.setQIndex(ANIMALS.length - 1);
}

const CONFIG = {
  enlaceLlamada: "https://calendly.com/chussama-digital/15min",
  enlaceRadiografia: "https://calendly.com/chussama-digital/15min",
  webhookLead: "/.netlify/functions/submit-lead",
  sendInforme: "/.netlify/functions/send-informe",
  claudeProxy: "/.netlify/functions/claude-radiografia",
};

const PALETTE = {
  night: "#1C1A17",
  bone: "#EDE6D8",
  sand: "#C8A96A",
  clay: "#A6533B",
  green: "#5B6B4E",
  paper: "#F6F1E7",
  ink: "#33302A",
  muted: "#8A8171",
};

const ANIMALS = [
  {
    key: "bufalo",
    animal: "Búfalo",
    glyph: "🐃",
    benefit: "Que te encuentren",
    lore:
      "En la sabana, los búfalos se mueven en manadas de cientos. Destacar entre tantos iguales es lo más difícil. Tu negocio empieza aquí: que alguien te vea entre toda la manada, y no te pierda de vista.",
    question: "Cuando alguien te descubre por primera vez, ¿qué se encuentra?",
    options: [
      "Un perfil de redes y poco más",
      "Una web, pero hace tiempo que no la toco",
      "Todo depende de si me escriben por WhatsApp",
      "Tengo un sistema pensado para captar y no perder el contacto",
    ],
    questionArrancando: "Cuando quieras que la gente te descubra, ¿qué vas a tener listo?",
    optionsArrancando: [
      "Nada montado todavía, ni sé por dónde empezar",
      "Tengo alguna idea, pero está todo en mi cabeza",
      "Voy a montar algo, pero improvisado",
      "Ya tengo pensado un sistema claro para captar y no perder el contacto",
    ],
  },
  {
    key: "elefante",
    animal: "Elefante",
    glyph: "🐘",
    benefit: "Que te compren",
    lore:
      "El elefante nunca olvida: recuerda caras y caminos durante décadas. Tu negocio necesita esa memoria, para que nadie que mostró interés se pierda solo porque no le diste seguimiento a tiempo.",
    question: "Cuando alguien muestra interés pero no compra al momento, ¿qué pasa?",
    options: [
      "Si no me escriben ellos otra vez, se pierde",
      "Intento acordarme de escribir, pero no siempre llego",
      "Tengo algo de seguimiento, pero manual",
      "Tengo un sistema que los acompaña hasta que deciden",
    ],
    questionArrancando:
      "Cuando alguien muestre interés pero no compre al momento, ¿qué tienes pensado hacer?",
    optionsArrancando: [
      "No lo he pensado, ya se verá",
      "Intentaré acordarme de escribirle",
      "Algo tengo en mente, pero manual",
      "Ya tengo pensado un sistema que los acompañe hasta que decidan",
    ],
  },
  {
    key: "leon",
    animal: "León",
    glyph: "🦁",
    benefit: "Que se sientan cuidados",
    lore:
      "La leona no caza y desaparece: la manada cuida a sus crías en grupo, sin descuidar a ninguna. Cuando alguien te paga, empieza justo ahí el cuidado. No termina.",
    question: "Justo después de que alguien te paga, ¿qué recibe?",
    options: [
      "Mi servicio, y ya",
      "Le escribo yo a mano, cuando puedo",
      "Recibe algo, pero distinto cada vez según mi día",
      "Vive una experiencia cuidada desde el minuto uno",
    ],
    questionArrancando: "Justo después de que alguien te pague por primera vez, ¿qué va a recibir?",
    optionsArrancando: [
      "No lo he decidido todavía",
      "Le escribiré yo a mano, cuando pueda",
      "Algo tengo pensado, pero sin definir del todo",
      "Ya tengo diseñada una experiencia cuidada desde el minuto uno",
    ],
  },
  {
    key: "rinoceronte",
    animal: "Rinoceronte",
    glyph: "🦏",
    benefit: "Que vuelvan",
    lore:
      "El rinoceronte es de los animales más difíciles de avistar en un safari: cuesta muchísimo encontrarlo. Igual que un buen cliente. Y cuando por fin lo tienes, dejar que se vaya sin más es perderlo dos veces.",
    question: "Cuando un cliente termina contigo, ¿qué le hace volver?",
    options: [
      "Nada, si vuelve es porque se acuerda solo",
      "Le escribo cuando me acuerdo yo",
      "Tengo alguna cosa, pero sin constancia",
      "Tengo un sistema que mantiene el vínculo vivo",
    ],
    questionArrancando: "Cuando un cliente termine contigo la primera vez, ¿qué harás para que vuelva?",
    optionsArrancando: [
      "No lo he pensado, si vuelve es porque se acuerda solo",
      "Le escribiré cuando me acuerde yo",
      "Tengo alguna idea, pero sin sistema",
      "Ya tengo pensado un sistema que mantenga el vínculo vivo",
    ],
  },
  {
    key: "leopardo",
    animal: "Leopardo",
    glyph: "🐆",
    benefit: "Que te sobre tiempo",
    lore:
      "El leopardo es puro ahorro de energía: preciso, silencioso, no malgasta un solo movimiento. Tu tiempo debería ir a lo que solo tú sabes hacer, no a repetir lo mismo una y otra vez.",
    question:
      "¿Cuánto de tu semana se va en tareas repetitivas: agendar, recordar, cobrar, contestar las mismas preguntas una y otra vez?",
    options: [
      "Muchísimo, vivo apagando fuegos",
      "Bastante, pero no sé por dónde empezar a soltarlo",
      "Algo tengo automatizado, poco",
      "Lo justo, tengo lo importante automatizado",
    ],
    questionArrancando:
      "¿Cuánto de tu semana crees que se irá en tareas repetitivas — agendar, recordar, cobrar, contestar las mismas preguntas una y otra vez?",
    optionsArrancando: [
      "Imagino que muchísimo, no tengo ni idea de cómo evitarlo",
      "Bastante probablemente, pero no sé por dónde empezar a soltarlo",
      "Algo habré pensado automatizar, poco",
      "Ya tengo pensado automatizar lo importante desde el principio",
    ],
  },
];

function animalCopy(animal, stage) {
  if (stage === "arrancando") {
    return {
      question: animal.questionArrancando,
      options: animal.optionsArrancando,
    };
  }
  return { question: animal.question, options: animal.options };
}

export default function TestBigFive() {
  const savedInitial = typeof window !== "undefined" ? loadSavedResult() : null;
  const [screen, setScreen] = useState(savedInitial ? "result" : "intro");
  const [stage, setStage] = useState(savedInitial?.stage ?? null);
  const [qIndex, setQIndex] = useState(savedInitial ? ANIMALS.length - 1 : 0);
  const [profession, setProfession] = useState(savedInitial?.profession ?? "");
  const [answers, setAnswers] = useState(savedInitial?.answers ?? {});
  const [email, setEmail] = useState(savedInitial?.email ?? "");
  const [name, setName] = useState(savedInitial?.name ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(savedInitial?.result ?? null);
  const [informeSource, setInformeSource] = useState(savedInitial?.informeSource ?? null);
  const [informeEmailSent, setInformeEmailSent] = useState(!!savedInitial?.informeSentAt);
  const [isRestoredResult, setIsRestoredResult] = useState(!!savedInitial?.result);
  const [error, setError] = useState(null);
  const topRef = useRef(null);

  useEffect(() => {
    const saved = loadSavedResult();
    if (!saved?.result) {
      retryPendingOperations();
      return;
    }
    applySavedResult(saved, {
      setStage,
      setAnswers,
      setProfession,
      setEmail,
      setName,
      setResult,
      setInformeSource,
      setScreen,
      setError,
      setQIndex,
    });
    if (!isResultUrl()) setResultUrl(true, { replace: true });
    retryPendingOperations();
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const saved = loadSavedResult();
      if (isResultUrl() && saved?.result) {
        applySavedResult(saved, {
          setStage,
          setAnswers,
          setProfession,
          setEmail,
          setName,
          setResult,
          setInformeSource,
          setScreen,
          setError,
          setQIndex,
        });
        setIsRestoredResult(true);
      } else if (!isResultUrl()) {
        setScreen("intro");
      }
    };
    const onPageShow = (event) => {
      if (!event.persisted) return;
      const saved = loadSavedResult();
      if (saved?.result) {
        applySavedResult(saved, {
          setStage,
          setAnswers,
          setProfession,
          setEmail,
          setName,
          setResult,
          setInformeSource,
          setScreen,
          setError,
          setQIndex,
        });
        if (!isResultUrl()) setResultUrl(true, { replace: true });
        setIsRestoredResult(true);
      }
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  const scrollTop = () => {
    if (topRef.current) topRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const resetTest = () => {
    clearSavedResult();
    setResultUrl(false, { replace: true });
    setScreen("intro");
    setStage(null);
    setQIndex(0);
    setProfession("");
    setAnswers({});
    setEmail("");
    setName("");
    setResult(null);
    setInformeSource(null);
    setInformeEmailSent(false);
    setError(null);
    setLoading(false);
    scrollTop();
  };

  const pickAnswer = (animalKey, optIndex) => {
    setAnswers((a) => ({ ...a, [animalKey]: optIndex }));
    setTimeout(() => {
      if (qIndex < ANIMALS.length - 1) {
        setQIndex((i) => i + 1);
      } else {
        setScreen("email");
      }
      scrollTop();
    }, 220);
  };

  const worstAnimal = () => {
    let worst = ANIMALS[0];
    let worstScore = 99;
    for (const a of ANIMALS) {
      const s = answers[a.key] !== undefined ? answers[a.key] : 3;
      if (s < worstScore) {
        worstScore = s;
        worst = a;
      }
    }
    return worst;
  };

  const buildPrompt = () => {
    const stageLabel =
      stage === "arrancando"
        ? "Está a punto de montar su negocio, aún sin clientes en marcha"
        : "Ya tiene negocio en marcha con clientes";
    const costeHint =
      stage === "arrancando"
        ? "tiempo mal invertido, decisiones que tendrá que deshacer o oportunidades que perderá al arrancar mal"
        : "tiempo, dinero o clientes que se escapan";
    const lines = ANIMALS.map((a) => {
      const idx = answers[a.key] !== undefined ? answers[a.key] : 3;
      const { options } = animalCopy(a, stage);
      return `- ${a.animal} (${a.benefit}): eligió "${options[idx]}" [nivel ${idx}/3, donde 0 es fuga total y 3 es resuelto]`;
    }).join("\n");
    const worst = worstAnimal();
    return `Eres la voz de "Optimiza-T con IA", una consultora que entra en negocios de servicios, entiende cómo funcionan por dentro y construye la tecnología a medida que necesita, sin que el cliente tenga que aprender tecnología. Tu tono es cálido y cercano, directo, sin jerga técnica, con un punto de urgencia honesta. Hablas de tú. Nunca usas las palabras "customer experience", "CTV", "funnel", "VSL" ni tecnicismos: hablas el idioma de una persona que da un servicio (psicóloga, fisio, coach, formadora, entrenadora). Nunca uses rayas largas (—).

Una persona acaba de hacer el test "Descubre todo lo que tu negocio tiene por optimizar", basado en el Método Big Five (5 fases con nombre de animal). Sus respuestas:

Momento del negocio: ${stageLabel}
Profesión: ${profession || "profesional de servicios"}
${lines}

Su mayor fuga está en el ${worst.animal} (${worst.benefit}).

Escribe una devolución personalizada, en español, de unas 130-170 palabras, con esta estructura exacta (sin encabezados, en prosa fluida y cálida, con saltos de párrafo):

1. Un saludo breve y humano que conecte con su profesión${stage === "arrancando" ? " y con que está por arrancar" : ""}.
2. Nombra su MAYOR fuga (el ${worst.animal}, ${worst.benefit}) con claridad y sin culpa: qué está pasando y, sobre todo, qué le está costando (${costeHint}). Puedes apoyarte una vez, con sutileza, en la metáfora del animal (${worst.animal}) si suma; no fuerces. Sé concreto y que le duela un poco, pero desde el cuidado, no desde el miedo.
3. Menciona en una frase que hay otras fases donde también hay margen, sin enumerarlas todas.
4. Cierra abriendo un bucle sin resolverlo: dile que esto tiene solución y que suele ser más sencilla de lo que parece, pero que cuál es la suya depende de cómo funciona su negocio por dentro${stage === "arrancando" ? " o de cómo lo va a montar" : ""}. Por eso el siguiente paso es una llamada corta y sin compromiso. No des la solución concreta. Invita a la llamada.

No uses viñetas ni listas. No firmes. No inventes datos que no tienes. Devuelve solo el texto de la devolución.`;
  };

  const radiografiaPlantilla = () => {
    const worst = worstAnimal();
    const saludo = name ? `${name}, ` : "";
    const prof = profession || "profesional de servicios";
    const contexto =
      stage === "arrancando"
        ? "De cara a arrancar, eso se traduce en decisiones que tendrás que deshacer, tiempo mal invertido o oportunidades que se te escaparán si nadie mira el conjunto antes de montar nada"
        : "En tu negocio eso se traduce en tiempo que se te escapa, clientes que se enfrían o valor que aún no capturas: no porque te falte capacidad, sino porque nadie ha mirado tu negocio entero con ese foco";
    const cierre =
      stage === "arrancando"
        ? "Esto tiene solución y suele ser más sencilla de lo que parece, pero cuál es la tuya depende de cómo vas a montar tu negocio por dentro. Por eso el siguiente paso es una llamada corta y sin compromiso."
        : "Esto tiene solución y suele ser más sencilla de lo que parece, pero cuál es la tuya depende de cómo funciona tu negocio por dentro. Por eso el siguiente paso es una llamada corta y sin compromiso.";
    return `${saludo}por lo que cuentas como ${prof}, tu mayor margen ahora mismo está en ${worst.benefit.toLowerCase()}: la fase del ${worst.animal}.

${worst.lore.split(".")[0]}. ${contexto}.

Hay más margen en las otras fases del Método Big Five. La buena noticia: no hace falta hacerlo todo a la vez; hace falta empezar por el agujero que más te cuesta hoy.

${cierre}`;
  };

  const buildLeadPayload = () => ({
    evento: "test_completado",
    nombre: name,
    email,
    profesion: profession,
    etapa: stage,
    respuestas: answers,
    mayor_fuga: worstAnimal().key,
    fecha: new Date().toISOString(),
  });

  const buildInformePayload = (radiografia) => ({
    nombre: name,
    email,
    radiografia,
    mayor_fuga: worstAnimal().key,
  });

  const persistResult = (radiografia, leadPayload, leadResult, informePayload, informeResult, source) => {
    saveResult({
      stage,
      answers,
      profession,
      email,
      name,
      result: radiografia,
      informeSource: source,
      mayor_fuga: worstAnimal().key,
      leadPayload,
      leadPending: !leadResult.ok,
      leadLastError: leadResult.ok ? null : leadResult.error,
      leadLastAttemptAt: new Date().toISOString(),
      leadAttempts: leadResult.ok ? 0 : 1,
      ...(leadResult.ok ? { leadSentAt: new Date().toISOString() } : {}),
      informePayload,
      informePending: !informeResult.ok,
      informeLastError: informeResult.ok ? null : informeResult.error,
      informeLastAttemptAt: new Date().toISOString(),
      informeAttempts: informeResult.ok ? 0 : 1,
      ...(informeResult.ok ? { informeSentAt: new Date().toISOString() } : {}),
    });
    if (!leadResult.ok) logLeadFailure(leadResult, leadPayload);
    if (!informeResult.ok) logInformeFailure(informeResult, informePayload);
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const fetchRadiografia = async () => {
    if (!CONFIG.claudeProxy) {
      return { text: radiografiaPlantilla(), source: "plantilla" };
    }

    const requestBody = {
      prompt: buildPrompt(),
      name,
      email,
      profession,
      stage,
      answers,
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch(CONFIG.claudeProxy, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.radiografia || data.text;
          if (text) return { text, source: "claude" };
        } else {
          console.error("[Optimiza-T · Test Big Five] claude-radiografia falló:", res.status);
        }
      } catch (err) {
        console.error("[Optimiza-T · Test Big Five] claude-radiografia error:", err);
      }
      if (attempt === 0) await sleep(2000);
    }

    return { text: radiografiaPlantilla(), source: "plantilla" };
  };

  const generateResult = async () => {
    setLoading(true);
    setError(null);
    try {
      const leadPayload = buildLeadPayload();
      const leadResult = await submitLead(leadPayload);

      const { text: radiografia, source } = await fetchRadiografia();
      setResult(radiografia);
      setInformeSource(source);

      const informePayload = buildInformePayload(radiografia);
      const informeResult = await submitInforme(informePayload);
      setInformeEmailSent(informeResult.ok);

      persistResult(radiografia, leadPayload, leadResult, informePayload, informeResult, source);
      setIsRestoredResult(false);
      setResultUrl(true);
      setScreen("result");
      scrollTop();
    } catch (err) {
      console.error("[Optimiza-T · Test Big Five] generateResult falló:", err);
      setError(
        "No he podido generar tu informe personalizado ahora mismo. Inténtalo de nuevo en un momento."
      );
    } finally {
      setLoading(false);
    }
  };

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const worst = worstAnimal();

  return (
    <div
      ref={topRef}
      style={{
        minHeight: "100vh",
        background: PALETTE.paper,
        color: PALETTE.ink,
        fontFamily: "'Georgia', 'Times New Roman', serif",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "clamp(16px, 4vw, 48px)",
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: "100%", maxWidth: 620 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 28,
            letterSpacing: "0.18em",
            fontSize: 12,
            textTransform: "uppercase",
            color: PALETTE.muted,
            fontFamily: "'Helvetica Neue', Arial, sans-serif",
          }}
        >
          <span
            style={{
              width: 26,
              height: 1,
              background: PALETTE.sand,
              display: "inline-block",
            }}
          />
          Optimiza-T con IA · Test Big Five
        </div>

        {screen === "intro" && (
          <div>
            <h1
              style={{
                fontSize: "clamp(30px, 6vw, 46px)",
                lineHeight: 1.05,
                margin: "0 0 20px",
                fontWeight: 400,
              }}
            >
              Descubre todo lo que tu negocio tiene por{" "}
              <span style={{ fontStyle: "italic", color: PALETTE.clay }}>
                optimizar
              </span>
              .
            </h1>
            <p style={{ fontSize: 18, lineHeight: 1.6, color: PALETTE.ink, margin: "0 0 14px" }}>
              Tu negocio está en la jungla, y cada fase tiene su animal: el búfalo que te hace
              destacar entre la manada, el elefante que no olvida a quien mostró interés, el
              león que cuida, el rinoceronte que regresa, el leopardo que no malgasta un solo
              movimiento.
            </p>
            <p style={{ fontSize: 18, lineHeight: 1.6, color: PALETTE.ink, margin: "0 0 14px" }}>
              Cinco preguntas para ver qué parte de tu negocio ya vuela sola y cuál te está
              costando tiempo, dinero o clientes, muchas veces sin que te enteres.
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: PALETTE.muted, margin: "0 0 34px" }}>
              Tarda menos de dos minutos. Y al terminar recibes tu informe personalizado.
            </p>

            <label style={miniLabel}>¿A qué te dedicas?</label>
            <input
              value={profession}
              onChange={(e) => setProfession(e.target.value)}
              placeholder="Psicóloga, fisio, coach, formadora…"
              style={inputStyle}
            />

            <button
              type="button"
              onClick={() => {
                setScreen("branch");
                scrollTop();
              }}
              disabled={!profession.trim()}
              style={{
                ...btnPrimary,
                marginTop: 24,
                opacity: profession.trim() ? 1 : 0.4,
                cursor: profession.trim() ? "pointer" : "not-allowed",
              }}
            >
              Empezar el safari →
            </button>
          </div>
        )}

        {screen === "branch" && (
          <div>
            <h2
              style={{
                fontSize: "clamp(21px, 4vw, 27px)",
                fontWeight: 400,
                lineHeight: 1.3,
                margin: "0 0 24px",
              }}
            >
              ¿Tu negocio ya está en marcha, con clientes, o estás en el momento de montarlo?
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { value: "marcha", label: "Ya tengo negocio, con clientes" },
                { value: "arrancando", label: "Estoy a punto de montarlo" },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setStage(value);
                    setScreen("q");
                    setQIndex(0);
                    scrollTop();
                  }}
                  style={{
                    textAlign: "left",
                    padding: "16px 18px",
                    borderRadius: 12,
                    border: `1px solid ${stage === value ? PALETTE.clay : "#D9CFBB"}`,
                    background: stage === value ? "#F0E7D4" : "#FFFDF8",
                    color: PALETTE.ink,
                    fontSize: 16,
                    lineHeight: 1.4,
                    cursor: "pointer",
                    fontFamily: "'Georgia', serif",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setScreen("intro");
                scrollTop();
              }}
              style={btnGhost}
            >
              ← Atrás
            </button>
          </div>
        )}

        {screen === "q" && (
          <div>
            <Progress current={qIndex + 1} total={ANIMALS.length} />
            <QuestionCard
              data={ANIMALS[qIndex]}
              question={animalCopy(ANIMALS[qIndex], stage).question}
              options={animalCopy(ANIMALS[qIndex], stage).options}
              selected={answers[ANIMALS[qIndex].key]}
              onPick={(i) => pickAnswer(ANIMALS[qIndex].key, i)}
            />
            {qIndex > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setQIndex((i) => i - 1);
                  scrollTop();
                }}
                style={btnGhost}
              >
                ← Atrás
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setScreen("branch");
                  scrollTop();
                }}
                style={btnGhost}
              >
                ← Atrás
              </button>
            )}
          </div>
        )}

        {screen === "email" && (
          <div>
            <div style={glyphBadge}>{worst.glyph}</div>
            <h2 style={{ fontSize: 28, fontWeight: 400, margin: "0 0 14px" }}>
              Tu informe personalizado está listo.
            </h2>
            <p style={{ fontSize: 17, lineHeight: 1.6, color: PALETTE.ink, margin: "0 0 28px" }}>
              Déjame dónde enviártelo y te lo muestro ahora mismo. Nada de spam. Solo tu
              informe y, si quieres, cómo darle solución.
            </p>

            <label style={miniLabel}>Tu nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="¿Cómo te llamas?"
              style={inputStyle}
            />
            <div style={{ height: 14 }} />
            <label style={miniLabel}>Tu email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tucorreo@ejemplo.com"
              type="email"
              style={inputStyle}
            />

            {error && (
              <p style={{ color: PALETTE.clay, fontSize: 14, marginTop: 12 }}>{error}</p>
            )}

            <button
              type="button"
              onClick={generateResult}
              disabled={!emailValid || !name.trim() || loading}
              style={{
                ...btnPrimary,
                marginTop: 24,
                opacity: emailValid && name.trim() && !loading ? 1 : 0.4,
                cursor:
                  emailValid && name.trim() && !loading ? "pointer" : "not-allowed",
              }}
            >
              {loading ? "Revelando tu informe…" : "Ver mi informe →"}
            </button>
          </div>
        )}

        {screen === "result" && (
          <div>
            <div style={glyphBadge}>{worst.glyph}</div>
            <div
              style={{
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: PALETTE.clay,
                marginBottom: 10,
                fontFamily: "'Helvetica Neue', Arial, sans-serif",
              }}
            >
              Tu mayor fuga · {worst.animal}: {worst.benefit}
            </div>
            {informeSource === "plantilla" && informeEmailSent && (
              <div style={{ margin: "0 0 18px" }}>
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: PALETTE.muted,
                    margin: 0,
                    fontFamily: "'Helvetica Neue', Arial, sans-serif",
                  }}
                >
                  Te hemos enviado una copia de este informe a tu correo.
                </p>
                <p
                  style={{
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: PALETTE.muted,
                    margin: "8px 0 0",
                    fontFamily: "'Helvetica Neue', Arial, sans-serif",
                  }}
                >
                  ¿No lo ves? Revisa la pestaña Promociones o la carpeta de spam: a veces Gmail
                  lo clasifica ahí. Busca el remitente Optimiza-T con IA.
                </p>
              </div>
            )}
            <div
              style={{
                fontSize: 18,
                lineHeight: 1.72,
                color: PALETTE.ink,
                whiteSpace: "pre-wrap",
                marginBottom: 30,
              }}
            >
              {result}
            </div>

            <div style={{ borderTop: `1px solid ${PALETTE.sand}`, paddingTop: 24 }}>
              <p
                style={{
                  fontSize: 17,
                  lineHeight: 1.55,
                  color: PALETTE.ink,
                  marginBottom: 16,
                  textAlign: "center",
                  fontWeight: 600,
                }}
              >
                ¿Quieres que lo veamos juntas?
              </p>
              <a
                href={CONFIG.enlaceLlamada}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...btnPrimary, display: "block", textAlign: "center", textDecoration: "none" }}
              >
                Reserva tu llamada gratis de 15 min →
              </a>
              <p
                style={{
                  fontSize: 13,
                  color: PALETTE.muted,
                  marginTop: 14,
                  textAlign: "center",
                }}
              >
                Sin compromiso. Si no hace falta que hagas nada, te lo digo yo.
              </p>
              {isRestoredResult && (
                <p
                  style={{
                    fontSize: 12,
                    color: PALETTE.muted,
                    marginTop: 20,
                    textAlign: "center",
                    fontFamily: "'Helvetica Neue', Arial, sans-serif",
                  }}
                >
                  <button
                    type="button"
                    onClick={resetTest}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      color: PALETTE.muted,
                      textDecoration: "underline",
                      cursor: "pointer",
                      fontSize: 12,
                      fontFamily: "inherit",
                    }}
                  >
                    Hacer el test otra vez
                  </button>
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Progress({ current, total }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background: i < current ? PALETTE.sand : "#DDD4C2",
              transition: "background 0.3s",
            }}
          />
        ))}
      </div>
      <div
        style={{
          fontSize: 12,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: PALETTE.muted,
          fontFamily: "'Helvetica Neue', Arial, sans-serif",
        }}
      >
        Territorio {current} de {total}
      </div>
    </div>
  );
}

function QuestionCard({ data, question, options, selected, onPick }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <span style={{ fontSize: 40, lineHeight: 1 }}>{data.glyph}</span>
        <div>
          <div style={{ fontSize: 22, fontWeight: 400 }}>{data.animal}</div>
          <div
            style={{
              fontSize: 13,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: PALETTE.clay,
              fontFamily: "'Helvetica Neue', Arial, sans-serif",
            }}
          >
            {data.benefit}
          </div>
        </div>
      </div>
      <p
        style={{
          fontSize: 15,
          lineHeight: 1.6,
          fontStyle: "italic",
          color: PALETTE.green,
          borderLeft: `2px solid ${PALETTE.sand}`,
          paddingLeft: 14,
          margin: "18px 0 4px",
        }}
      >
        {data.lore}
      </p>
      <h2
        style={{
          fontSize: "clamp(21px, 4vw, 27px)",
          fontWeight: 400,
          lineHeight: 1.3,
          margin: "20px 0 24px",
        }}
      >
        {question}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {options.map((opt, i) => (
          <button
            key={opt}
            type="button"
            onClick={() => onPick(i)}
            style={{
              textAlign: "left",
              padding: "16px 18px",
              borderRadius: 12,
              border: `1px solid ${selected === i ? PALETTE.clay : "#D9CFBB"}`,
              background: selected === i ? "#F0E7D4" : "#FFFDF8",
              color: PALETTE.ink,
              fontSize: 16,
              lineHeight: 1.4,
              cursor: "pointer",
              fontFamily: "'Georgia', serif",
              transition: "border 0.2s, background 0.2s",
            }}
            onMouseEnter={(e) => {
              if (selected !== i) e.currentTarget.style.borderColor = PALETTE.sand;
            }}
            onMouseLeave={(e) => {
              if (selected !== i) e.currentTarget.style.borderColor = "#D9CFBB";
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "14px 16px",
  fontSize: 16,
  fontFamily: "'Georgia', serif",
  border: "1px solid #D9CFBB",
  borderRadius: 10,
  background: "#FFFDF8",
  color: "#33302A",
  boxSizing: "border-box",
  outline: "none",
};

const miniLabel = {
  display: "block",
  fontSize: 13,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "#8A8171",
  marginBottom: 8,
  fontFamily: "'Helvetica Neue', Arial, sans-serif",
};

const btnPrimary = {
  width: "100%",
  padding: "16px 20px",
  fontSize: 16,
  fontFamily: "'Helvetica Neue', Arial, sans-serif",
  fontWeight: 600,
  letterSpacing: "0.02em",
  color: "#F6F1E7",
  background: "#A6533B",
  border: "none",
  borderRadius: 12,
  cursor: "pointer",
};

const btnGhost = {
  marginTop: 18,
  padding: "8px 0",
  fontSize: 14,
  color: "#8A8171",
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: "'Helvetica Neue', Arial, sans-serif",
};

const glyphBadge = {
  fontSize: 52,
  lineHeight: 1,
  marginBottom: 18,
};
