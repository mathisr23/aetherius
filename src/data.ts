export interface Work {
  slug: string;
  station: number;
  index: string;
  title: string;
  kicker: string;
  client: string;
  year: string;
  role: string;
  blurb: string;
  body: string[];
  stats: [string, string][];
}

export const WORKS: Work[] = [
  {
    slug: "the-wanderer",
    station: 2,
    index: "01",
    title: "The Wanderer",
    kicker: "Volumetric brand film",
    client: "Maison Vey",
    year: "2026",
    role: "Direction · CG · Score",
    blurb: "A blade, a cat, and forty seconds of fog. A brand film shot inside a single light field — no set, no sun, only depth.",
    body: [
      "Vey asked for a film without product. We gave them a walk: one figure, one blade dragging a line through the haze, and a witness who never blinks.",
      "Every frame is lit by a single volumetric source. Shape is carved by distance alone — what is close turns to ink, what is far dissolves into paper.",
    ],
    stats: [["38s", "Runtime"], ["1", "Light source"], ["0", "Physical sets"]],
  },
  {
    slug: "ascension",
    station: 3,
    index: "02",
    title: "Ascension",
    kicker: "Spatial installation",
    client: "Pavilion Zero",
    year: "2025",
    role: "Concept · Real-time · Space",
    blurb: "A nine-metre silhouette that breathes with the room. Visitors walk beneath it; it lowers its head as they arrive.",
    body: [
      "Built for a hall with no windows, Ascension reads the crowd from above and answers in posture. The more people gather, the wider it opens its arms.",
      "Rendered live on a 14k LED wall behind a curtain of theatrical haze, so the figure appears to stand inside the air itself.",
    ],
    stats: [["9m", "Figure height"], ["14k", "LED canvas"], ["62d", "Exhibition run"]],
  },
  {
    slug: "legion",
    station: 4,
    index: "03",
    title: "Legion",
    kicker: "Crowd simulation",
    client: "Noctua Pictures",
    year: "2025",
    role: "Simulation · Previs · Grade",
    blurb: "Four thousand soldiers and one woman who refuses to turn around. Previs and crowd system for a feature-length war epic.",
    body: [
      "We wrote the crowd as weather: each body a particle of intent, cohering only at the edge of visibility. The fog is the budget — it lets four thousand agents read like forty thousand.",
      "The lead stays closest to camera in every shot, darkest in every frame. The army never resolves into faces.",
    ],
    stats: [["4,096", "Agents"], ["212", "Shots"], ["3", "Continents"]],
  },
  {
    slug: "collision",
    station: 5,
    index: "04",
    title: "Collision",
    kicker: "Title sequence",
    client: "Oblique Records",
    year: "2024",
    role: "Direction · Motion · Edit",
    blurb: "Two bodies, one frame, a thousandth of a second stretched to ninety. The opening titles for a record about impact.",
    body: [
      "Collision holds the exact instant before contact and walks the camera around it. Nothing moves except the viewer — and the dust.",
      "Cut to the album's lead single, each beat pushes the camera a hand's width closer, until the frame is only skin and light.",
    ],
    stats: [["90s", "Held instant"], ["1/1000", "Real duration"], ["24", "Typefaces drawn"]],
  },
];

export const CHAPTERS = [
  "Threshold",
  "Manifesto",
  "The Wanderer",
  "Ascension",
  "Legion",
  "Collision",
  "Disciplines",
  "Exit",
];

export interface Discipline {
  name: string;
  line: string;
  detail: string;
  deliverables: string[];
  seenIn: string[];
}

export const DISCIPLINES: Discipline[] = [
  {
    name: "Spatial Films",
    line: "Narrative shot inside volumetric light.",
    detail: "Brand films and shorts staged in a single light field. We block the action like theatre, then move the camera like a crane operator who never gets tired.",
    deliverables: ["Brand films", "Launch spots", "Music videos", "Cut-downs for every format"],
    seenIn: ["the-wanderer"],
  },
  {
    name: "Architectural Visualisation",
    line: "Buildings before they cast a shadow.",
    detail: "Competition imagery and walkthroughs that sell a mood before a floor plan. The structure assembles itself in front of the jury, beam by beam.",
    deliverables: ["Competition stills", "Assembly films", "Interactive walkthroughs", "Planning-ready views"],
    seenIn: ["ascension"],
  },
  {
    name: "Real-time Worlds",
    line: "Engines, installations, live stages.",
    detail: "Environments that answer back. Pillars that ripple under your hand, crowds that notice you, lights that breathe with a room. Built in-engine, shipped to walls and browsers.",
    deliverables: ["LED & projection content", "WebGL experiences", "Live show systems", "Touch installations"],
    seenIn: ["ascension", "legion"],
  },
  {
    name: "Crowd & Simulation",
    line: "Weather made of people.",
    detail: "Agent systems for film and space: thousands of bodies with intent, readable at a distance, never repeating. We tune them like a storm, not like a spreadsheet.",
    deliverables: ["Crowd previs", "Agent simulation", "Battle choreography", "Flow studies for venues"],
    seenIn: ["legion"],
  },
  {
    name: "Title Sequences",
    line: "The first ninety seconds.",
    detail: "Openings for films, series and records. One frozen instant, walked around slowly, with typography that arrives exactly on the beat.",
    deliverables: ["Main titles", "End credits", "Album visualisers", "Festival idents"],
    seenIn: ["collision"],
  },
];
