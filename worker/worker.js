// Tussenserver voor "Met alle respect" (Cloudflare Worker).
//
// Houdt de Anthropic API-sleutel geheim: de browser stuurt alleen de stelling,
// de server bouwt zelf de vraag aan Claude. Zo kan niemand deze server gebruiken
// als gratis algemene Claude-toegang.
//
// Instellen in Cloudflare (Settings -> Variables and Secrets):
//   ANTHROPIC_API_KEY  (Secret)  je sleutel, begint met sk-ant-
//   ALLOWED_ORIGIN     (Text)    optioneel, standaard https://joris-git.github.io

const DEFAULT_ORIGIN = "https://joris-git.github.io";
const MODEL = "claude-opus-5-5";
const LIMITS = { stelling: 1000, context: 600, standpunt: 600 };
const TONEN = ["zacht en warm", "zakelijk en to the point", "luchtig, met een vleugje humor"];

export default {
  async fetch(request, env) {
    const allowed = env.ALLOWED_ORIGIN || DEFAULT_ORIGIN;
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": allowed,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    const reply = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

    if (origin !== allowed) return reply(403, { error: "forbidden" });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply(405, { error: "method_not_allowed" });
    if (!env.ANTHROPIC_API_KEY) return reply(500, { error: "not_configured" });

    let body;
    try { body = await request.json(); } catch { return reply(400, { error: "bad_request" }); }
    const input = {
      stelling: clean(body.stelling, LIMITS.stelling),
      context: clean(body.context, LIMITS.context),
      standpunt: clean(body.standpunt, LIMITS.standpunt),
      toon: TONEN.includes(body.toon) ? body.toon : TONEN[0],
      relatie: Object.hasOwn(RELATIES, body.relatie) ? body.relatie : "vrouw",
    };
    if (!input.stelling) return reply(400, { error: "bad_request" });

    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "server-side-fallback-2026-07-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 8000,
          fallbacks: "default",
          output_config: { effort: "medium" },
          messages: [{ role: "user", content: buildPrompt(input) }],
        }),
      });
    } catch {
      return reply(502, { error: "upstream_error" });
    }
    if (res.status === 429) return reply(429, { error: "rate_limited" });
    if (!res.ok) return reply(502, { error: "upstream_error" });

    const msg = await res.json();
    if (msg.stop_reason === "refusal") return reply(422, { error: "refused" });
    const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const result = parseJson(text);
    if (!result || !Array.isArray(result.argumenten)) return reply(502, { error: "invalid_json" });
    return reply(200, result);
  },
};

function clean(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  return null;
}

const RELATIES = {
  vrouw: { wie: "je vrouw", zegt: "zegt", heeft: "heeft", omschrijving: "de vrouw van de gebruiker", regel: "Het gaat om een partner: gelijkwaardig en liefdevol." },
  man: { wie: "je man", zegt: "zegt", heeft: "heeft", omschrijving: "de man van de gebruiker", regel: "Het gaat om een partner: gelijkwaardig en liefdevol." },
  kind: { wie: "je kind", zegt: "zegt", heeft: "heeft", omschrijving: "een kind van de gebruiker", regel: "Het gaat om een kind van de gebruiker. Schrijf 'zin' en 'vraag' in taal die bij een kind past en houd rekening met de leeftijd als die in de context staat. De gebruiker blijft als ouder duidelijk, maar neemt het kind serieus." },
  collega: { wie: "je collega", zegt: "zegt", heeft: "heeft", omschrijving: "een collega van de gebruiker", regel: "Het gaat om een collega: professioneel en collegiaal. Houd rekening met de werkverhouding." },
  ouders: { wie: "je ouders", zegt: "zeggen", heeft: "hebben", omschrijving: "de ouders van de gebruiker", regel: "Het gaat om de ouders van de gebruiker: respectvol, met begrip voor hun ervaring. Spreek ze in 'zin' en 'vraag' aan met 'jullie'." }
};

// Staat zowel in index.html als in worker/worker.js; pas ze samen aan.
function buildPrompt(i) {
  const r = RELATIES[i.relatie] || RELATIES.vrouw;
  return [
    "Je helpt iemand om respectvol en goed onderbouwd tegengas te geven aan iets wat " + r.omschrijving + " " + r.zegt + ". Hieronder heet die persoon of dat stel 'de ander'. Het doel is een beter gesprek, niet winnen.",
    "",
    "Regels:",
    "- Schrijf in natuurlijk, helder Nederlands. Toon: " + i.toon + ".",
    "- " + r.regel,
    "- Wees eerlijk. Heeft de ander grotendeels gelijk, zeg dat dan duidelijk en zet ander_gelijk hoog. Geef dan alsnog de beste tegenargumenten, maar markeer ze eerlijk als 'zwak' of 'redelijk'.",
    "- Begin met wat er klopt aan het standpunt van de ander (de sterkste versie van dat argument).",
    "- Onderbouw elk tegenargument met logica, algemeen bekende feiten of praktijkervaring. Verzin geen studies, bronnen, namen of precieze cijfers. Ben je ergens niet zeker van, zeg dat.",
    "- Geen manipulatie, geen sarcasme, geen kleinerende taal, geen 'je bent emotioneel'. Neem de ander serieus.",
    "- Gaat het eigenlijk over gevoelens of behoeften in plaats van feiten, benoem dat in 'valkuil' of 'vraag'.",
    "- Schrijf 'oordeel', 'erkenning', 'valkuil' en 'nachecken' gericht aan de gebruiker (je/jij) en noem de ander '" + r.wie + "'.",
    "- 'zin' is één tot drie zinnen die de gebruiker letterlijk kan zeggen, in de ik-vorm, gericht aan de ander.",
    "",
    "Wat de ander " + r.zegt + ": " + i.stelling,
    i.context ? "Context: " + i.context : "",
    i.standpunt ? "Wat de gebruiker zelf vindt: " + i.standpunt : "",
    "",
    "Antwoord met alleen één JSON-object in deze vorm:",
    '{"ander_gelijk": 0-100 (geheel getal: hoeveel gelijk de ander volgens jou heeft), "oordeel": "1-2 zinnen eerlijk eindoordeel", "erkenning": "wat er klopt aan het punt van de ander", "argumenten": [{"titel": "kort", "uitleg": "1-2 zinnen", "onderbouwing": "waarom dit klopt of waar het op rust", "soort": "feit|logica|praktijk|waarden", "sterkte": "sterk|redelijk|zwak"}] (2 tot 4 stuks), "zin": "wat de gebruiker kan zeggen", "vraag": "een oprecht nieuwsgierige vraag aan de ander", "valkuil": "wat de gebruiker beter niet kan zeggen of doen", "nachecken": ["1 tot 3 dingen om te controleren"]}'
  ].filter((l) => l !== "").join("\n");
}
