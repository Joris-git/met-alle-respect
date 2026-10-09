# Met alle respect

Typ wat je vrouw zegt en krijg eerlijke, onderbouwde tegenargumenten. De app laat ook zien waar ze gelijk in heeft, schat in wie het meest gelijk heeft, en geeft een zin die je zo kunt zeggen.

## Gebruik

Open `index.html` via GitHub Pages of lokaal in je browser.

- **In Claude (claude.ai):** de app gebruikt je eigen Claude-account. Je hoeft niets in te stellen.
- **Op GitHub Pages met tussenserver:** bezoekers hoeven niets in te vullen. De tussenserver (zie hieronder) gebruikt jouw sleutel.
- **Zonder tussenserver:** bezoekers vullen een eigen Anthropic API-sleutel in (aan te maken op [console.anthropic.com](https://console.anthropic.com/settings/keys)). De sleutel blijft in je browser (localStorage) en gaat rechtstreeks naar de Anthropic API. Hij staat nergens in deze repository.

Elke vraag kost een klein beetje API-tegoed.

## Online zetten met GitHub Pages

Settings → Pages → *Deploy from a branch* → branch `main`, map `/ (root)` → Save.

## Tussenserver (Cloudflare Worker)

Met de tussenserver kan iedereen de app gebruiken zonder eigen sleutel. Alle vragen gaan dan van jouw Anthropic-tegoed af.

1. Maak een gratis account op [dash.cloudflare.com](https://dash.cloudflare.com/sign-up).
2. Ga naar **Workers & Pages** → **Create** → **Create Worker**, geef hem een naam (bijv. `met-alle-respect`) en klik **Deploy**.
3. Klik **Edit code**, vervang alles door de inhoud van [`worker/worker.js`](worker/worker.js) en klik **Deploy**.
4. Ga naar **Settings** → **Variables and Secrets** → **Add**: type **Secret**, naam `ANTHROPIC_API_KEY`, waarde je sleutel. Opslaan.
5. Zet het adres van de worker (eindigt op `.workers.dev`) in `index.html` bij `PROXY_URL`.

**Bescherming tegen misbruik**
- De server accepteert alleen verzoeken vanaf `https://joris-git.github.io` (aan te passen met de variabele `ALLOWED_ORIGIN`).
- De server bouwt de vraag aan Claude zelf en accepteert alleen een stelling van maximaal 1000 tekens. Hij is dus niet bruikbaar als algemene Claude-toegang.
- Stel in de [Anthropic Console](https://console.anthropic.com) een maandlimiet in voor je uitgaven. Dat is de enige harde grens: wie het echt wil, kan de adrescontrole omzeilen.
