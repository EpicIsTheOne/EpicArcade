// MINDLESS-Hermes :: stages.js — level definitions (faithful layouts from original .tscn data)
"use strict";
// Ground Y = 120 in world space; stage length in px at 240x135 native.
// Checkpoints: { x (trigger), cap, enemies: [[type, spawnOffsetX]...] , boss? }
// Enemy types: basic | dasher | elite | shooter

const STAGE_DEFS = {
  training: {
    id: "combat_training", name: "COMBAT TRAINING", bpm: 140,
    music: "mus_training", metronome: "met_140",
    length: 640, env: "street",
    spawn: 30,
    checkpoints: [
      { x: 240, cap: 1, enemies: [["basic", -20], ["basic", 220]] },
      { x: 480, cap: 2, enemies: [["basic", -20], ["basic", 200], ["shooter", 210]] },
    ],
    story: {
      opening: [
        ["DRONE", "Vitals restored. Kontrau Menso training protocol online."],
        ["ECLIPTIO", "Training? Point me at the machines."],
        ["NOVA", "Learn first. Survive second. Revenge can wait."],
      ],
      completion: [["DRONE", "Combat synchronization confirmed. The resistance is waiting."]],
    },
  },
  resistance: {
    id: "resistance_tutorial", name: "KONTRAU MENSO", bpm: 118,
    music: "mus_resistance", metronome: "met_118",
    length: 720, env: "bar",
    spawn: 26,
    checkpoints: [
      { x: 230, cap: 2, enemies: [["basic", -20], ["basic", 210], ["dasher", 190]] },
      { x: 520, cap: 3, enemies: [["dasher", -24], ["basic", 200], ["basic", 215], ["shooter", 205]] },
    ],
    story: {
      opening: [
        ["RESISTANCE", "The MIND network owns the streets. We teach people how to take them back."],
        ["NOVA", "Then teach us. Angelica destroyed our home."],
        ["ECLIPTIO", "And we're returning the favor."],
      ],
      checkpoint: [["RESISTANCE", "Swap twins to change the fight. Ecliptio breaks armor; Nova controls the rhythm."]],
      completion: [["RESISTANCE", "Your first assignment is the Oblitus Slums. Bring back survivors and answers."]],
    },
  },
  slums: {
    id: "oblitus_slums", name: "OBLITUS SLUMS", bpm: 118,
    music: "mus_slums", metronome: "met_118",
    length: 1240, env: "street",
    // faithful to stage_01.tscn: CP1@-32(cap default 3), CP2@176 cap4, CP3@344 cap5, CP4@680 cap5(+dasher), boss CP5@1032
    spawn: 28,
    checkpoints: [
      { x: 150, cap: 3, enemies: [["basic", -20], ["basic", 200], ["basic", 205], ["shooter", 210]] },
      { x: 420, cap: 4, enemies: [["basic", -20], ["basic", 205], ["shooter", 200], ["basic", 210]] },
      { x: 700, cap: 5, enemies: [["basic", -20], ["dasher", 195], ["basic", 205], ["shooter", 215], ["basic", 210]] },
      { x: 980, cap: 1, enemies: [], boss: "evangeline" },
    ],
    story: {
      opening: [
        ["NOVA", "These streets used to be full of people."],
        ["ECLIPTIO", "Now they're full of targets."],
      ],
      checkpoint: [["EVANGELINE", "Those upgrades belong to me. Try not to damage them while my MINDs remove you."]],
      boss: [
        ["NOVA", "Evangeline. Shut down the MINDs and nobody else has to die."],
        ["EVANGELINE", "But watching prototypes struggle is the best part."],
      ],
      completion: [["DRONE", "Recovered signal points toward Ruined Paradise."]],
    },
  },
  paradise: {
    id: "ruined_paradise", name: "RUINED PARADISE", bpm: 130,
    music: "mus_paradise", metronome: "met_130",
    length: 1100, env: "bar",
    spawn: 16,
    // faithful to stage_2.tscn: dashers introduced early, elite appears mid-stage
    checkpoints: [
      { x: 170, cap: 3, enemies: [["dasher", -24], ["basic", 190], ["basic", 205]] },
      { x: 470, cap: 5, enemies: [["basic", -20], ["dasher", 185], ["basic", 200], ["shooter", 210], ["basic", 215]] },
      { x: 760, cap: 5, enemies: [["elite", -22], ["basic", 190], ["dasher", 200], ["basic", 210], ["shooter", 215]] },
      { x: 950, cap: 1, enemies: [], boss: "eden" },
    ],
    story: {
      opening: [
        ["ECLIPTIO", "They called this paradise?"],
        ["NOVA", "Before Angelica rebuilt it in her image."],
      ],
      checkpoint: [
        ["EDEN", "Human resistance remains statistically inefficient."],
        ["NOVA", "Then your statistics are about to get worse."],
      ],
      boss: [
        ["EDEN", "Every movement you make lands exactly where the network predicts."],
        ["NOVA", "Then listen closely. We're changing the rhythm."],
      ],
      completion: [["DRONE", "The signal originates inside the MIND production facility."]],
    },
  },
  facility: {
    id: "mind_facility", name: "MIND FACILITY", bpm: 140,
    music: "mus_facility", metronome: "met_140",
    length: 1150, env: "facility",
    spawn: 18,
    // faithful to stage_3.tscn: heavy mix, elite + shooters, Angelica finale
    checkpoints: [
      { x: 160, cap: 3, enemies: [["dasher", -22], ["basic", 190], ["elite", 205]] },
      { x: 430, cap: 4, enemies: [["dasher", -22], ["shooter", 195], ["basic", 205], ["basic", 215]] },
      { x: 700, cap: 5, enemies: [["elite", -24], ["dasher", 190], ["shooter", 200], ["basic", 212], ["basic", 218]] },
      { x: 960, cap: 1, enemies: [], boss: "angelica" },
    ],
    story: {
      opening: [
        ["EDEN", "Welcome to the mechanism that replaces your species."],
        ["ECLIPTIO", "Mechanisms break."],
      ],
      checkpoint: [
        ["NOVA", "These implants link every general to the network."],
        ["ECLIPTIO", "Then we cut the link."],
      ],
      boss: [
        ["ANGELICA", "You killed my family and call yourselves heroes?"],
        ["NOVA", "Eden and the implant are using you. Let us end this."],
      ],
      completion: [["EDEN", "Angelica was always temporary. I am not."]],
    },
  },
};

// Campaign order (original STAGE_PREFABS flow; BossTest maps to training)
const CAMPAIGN = ["training", "resistance", "slums", "paradise", "facility"];

// Intro slides (verbatim original text)
const INTRO_SLIDES = [
  { img: "intro1", lines: [0, 1] },
  { img: "intro2", lines: [2, 3, 4] },
  { img: "intro3", lines: [5, 6, 7] },
  { img: "intro4", lines: [8, 9, 10, 11] },
  { img: "intro5", lines: [12, 13, 14, 15, 16, 17] },
  { img: "intro6", lines: [18, 19] },
];
const INTRO_TEXTS = [
  "This world used to be like this",
  "Cities thrived.",
  "Until MIND took over…",
  "They're great tech spread… everywhere.",
  "Before we knew it..",
  "MIND",
  "supposedly founded by Angelica",
  "Put the world into mass chaos",
  "But even in times like these",
  "we fight back.",
  "A resistance was formed…",
  "Kontraŭ Menso.",
  "And among them…",
  "Two would change everything.",
  "They won't just fight to survive...",
  "But to take everything back.",
  "To break the system.",
  "To free the world.",
  "To make it…",
  "MINDLESS",
];

// Tutorial prompts (verbatim from ui.tscn text_list)
const TUTORIAL_PROMPTS = [
  "Press WASD or ARROW KEYS to move",
  "Press X to jump",
  "Press C to attack",
  "Jump and attack to Jumpkick",
  "press E to swap twins",
  "Press attack on beat for more damage and knockback!",
];
