/* LONG DUSK — script_a.js — scenes s01–s10 (ACT I MORNING LIGHT, ACT II THE MIRROR). */
(function(){
  window.LD_SCRIPT = window.LD_SCRIPT || [];

  // Subtitle helper: display duration = 2.5s + 0.06s per character, rounded to 0.1s.
  function L(t, who, text, it){
    var o = { t: t, d: Math.round((2.5 + 0.06 * text.length) * 10) / 10, who: who, text: text };
    if (it) o.it = true;
    return o;
  }

  var A1 = { act: 1, actTitle: 'MORNING LIGHT', actTitleJp: '朝の光' };
  var A2 = { act: 2, actTitle: 'THE MIRROR', actTitleJp: '鏡' };
  function scene(a, o){ o.act = a.act; o.actTitle = a.actTitle; o.actTitleJp = a.actTitleJp; return o; }

  // ───────────────────────────────────────────── s01 — Dawn
  window.LD_SCRIPT.push(scene(A1, {
    id: 's01', title: 'Dawn', duration: 100,
    shots: [
      {t:0,  shot:'black'},
      {t:6,  shot:'orrin_rise', p:{pan:'up', light:0.15}},
      {t:16, shot:'vesper_exterior', p:{light:0.05, pan:'in'}},
      {t:22, shot:'mirror_petals_close', p:{opening:true}},
      {t:30, shot:'vesper_exterior', p:{light:0.85, pan:'out'}},
      {t:34, shot:'ilse_balcony', p:{light:0.6}},
      {t:42, shot:'cigarette_closeup'},
      {t:48, shot:'ilse_closeup', p:{mood:'tired', bg:'apartment', pan:'none'}},
      {t:53, shot:'ilse_mira_kitchen'},
      {t:59, shot:'mira_closeup', p:{mood:'neutral', bg:'apartment'}},
      {t:65, shot:'ilse_closeup', p:{mood:'neutral', bg:'apartment'}},
      {t:75, shot:'mira_closeup', p:{mood:'anger', bg:'apartment'}},
      {t:80, shot:'ilse_closeup', p:{mood:'tired', bg:'apartment', pan:'in'}},
      {t:85, shot:'ilse_mira_kitchen'},
      {t:89, shot:'photo_daniel'},
      {t:94, shot:'orrin_rise', p:{light:0.7, pan:'none'}}
    ],
    music: [
      {t:0,  cue:'main_title', fade:3},
      {t:40, cue:'silence', fade:5},
      {t:88, cue:'ilse_theme', fade:3}
    ],
    sfx: [
      {t:22, sfx:'mirror_motor'},
      {t:24, sfx:'pa_chime'},
      {t:43, sfx:'lighter'},
      {t:49, sfx:'door'},
      {t:86, sfx:'door'}
    ],
    lines: [
      L(25,   'PA',   'Mirror Authority. Petal array opening. Day cycle begins.'),
      L(35,   'PA',   'Reminder: open flame is prohibited in residential sectors.'),
      L(50,   'MIRA', 'You\'re up.'),
      L(54,   'ILSE', 'I\'m always up. You\'re the novelty.'),
      L(59.5, 'MIRA', 'They watch the balconies, you know.'),
      L(65,   'ILSE', 'Then they\'ve seen worse.'),
      L(70.5, 'ILSE', 'That jacket smells of engine grease.'),
      L(75.5, 'MIRA', 'It\'s not my jacket.'),
      L(80.5, 'ILSE', 'I know whose jacket it is.')
    ],
    cards: [
      {t:0.5, d:5, text:'ACT I — MORNING LIGHT', jp:'朝の光', style:'act'},
      {t:8,   d:5, text:'ORRIN SYSTEM · VESPER HABITAT', style:'location'},
      {t:94,  d:6, text:'LONG DUSK', jp:'長い黄昏', style:'title'}
    ]
  }));

  // ───────────────────────────────────────────── s02 — Treaty Hall
  window.LD_SCRIPT.push(scene(A1, {
    id: 's02', title: 'Ice', duration: 150,
    shots: [
      {t:0,   shot:'treaty_hall_wide', p:{pan:'in'}},
      {t:10,  shot:'podium', p:{who:'chair'}},
      {t:17,  shot:'podium', p:{who:'ilse'}},
      {t:23,  shot:'ilse_closeup', p:{mood:'neutral', bg:'hall'}},
      {t:30,  shot:'kasimir_entrance'},
      {t:40,  shot:'kasimir_closeup', p:{mood:'neutral', bg:'hall', pan:'in'}},
      {t:47,  shot:'ilse_eyes', p:{mood:'neutral'}},
      {t:52,  shot:'kasimir_eyes', p:{mood:'soft'}},
      {t:57,  shot:'ilse_closeup', p:{mood:'tired', bg:'hall', pan:'none'}},
      {t:63,  shot:'severin_gallery'},
      {t:68,  shot:'treaty_hall_wide', p:{pan:'left'}},
      {t:75,  shot:'podium', p:{who:'kasimir'}},
      {t:83,  shot:'kasimir_closeup', p:{mood:'neutral', bg:'hall'}},
      {t:90,  shot:'ilse_closeup', p:{mood:'neutral', bg:'hall', pan:'none'}},
      {t:95,  shot:'kasimir_closeup', p:{mood:'resolve', bg:'hall', pan:'in'}},
      {t:100, shot:'severin_gallery'},
      {t:105, shot:'corridor', p:{pan:'in'}},
      {t:112, shot:'ilse_closeup', p:{mood:'neutral', bg:'hall'}},
      {t:117, shot:'kasimir_closeup', p:{mood:'soft', bg:'hall', pan:'none'}},
      {t:121, shot:'ilse_closeup', p:{mood:'tired', bg:'hall', pan:'none'}},
      {t:125, shot:'corridor', p:{pan:'right'}},
      {t:131, shot:'kasimir_closeup', p:{mood:'tired', bg:'hall', pan:'none'}},
      {t:141, shot:'treaty_hall_wide', p:{empty:true, pan:'out'}}
    ],
    music: [
      {t:0,   cue:'hall_ceremony', fade:3},
      {t:29,  cue:'silence', fade:4},
      {t:126, cue:'kasimir_theme', fade:6}
    ],
    sfx: [
      {t:0,   sfx:'crowd_murmur'},
      {t:3,   sfx:'gavel'},
      {t:28.5,sfx:'door'},
      {t:29,  sfx:'crowd_murmur'},
      {t:30,  sfx:'footsteps'},
      {t:100, sfx:'crowd_murmur'},
      {t:105, sfx:'footsteps'},
      {t:125, sfx:'footsteps'}
    ],
    lines: [
      L(4,    'CHAIR',   'This session of the Orrin Accord review is called to order.'),
      L(11,   'CHAIR',   'Twelve years. Let us try to deserve a thirteenth.'),
      L(17.5, 'ILSE',    'The Concordat comes to this table in good faith.'),
      L(23.5, 'ILSE',    'As it did twelve years ago. As it will, I hope—'),
      L(69,   'CHAIR',   'The chair recognizes the delegation of the Shelf.'),
      L(75,   'KASIMIR', 'Thank you, Chair.'),
      L(79.5, 'KASIMIR', 'I was asked to prepare remarks.'),
      L(84.5, 'KASIMIR', 'I prepared several. They were long.'),
      L(91,   'KASIMIR', 'We have brought ice.'),
      L(96,   'KASIMIR', 'We always bring ice.'),
      L(106,  'AIDE',    'Negotiator, the press office wants a statement.'),
      L(111.8,'ILSE',    'Tell them the ice arrived.'),
      L(117.5,'KASIMIR', 'Ilse.'),
      L(121,  'ILSE',    'Delegate Oduya.')
    ],
    cards: [
      {t:2, d:5, text:'TREATY HALL · VESPER', style:'location'}
    ]
  }));

  // ───────────────────────────────────────────── s03 — The Garden
  window.LD_SCRIPT.push(scene(A1, {
    id: 's03', title: 'Tomatoes', duration: 120,
    shots: [
      {t:0,   shot:'severin_garden', p:{pan:'right'}},
      {t:8,   shot:'ilse_severin_garden'},
      {t:20,  shot:'severin_closeup', p:{mood:'neutral', bg:'garden'}},
      {t:27,  shot:'ilse_closeup', p:{mood:'neutral', bg:'garden'}},
      {t:31,  shot:'severin_closeup', p:{mood:'soft', bg:'garden'}},
      {t:37,  shot:'tomato_closeup', p:{offer:true}},
      {t:44,  shot:'ilse_closeup', p:{mood:'neutral', bg:'garden', pan:'none'}},
      {t:50,  shot:'severin_closeup', p:{mood:'soft', bg:'garden', pan:'none'}},
      {t:57,  shot:'ilse_severin_garden', p:{pan:'left'}},
      {t:63,  shot:'ilse_closeup', p:{mood:'tired', bg:'garden'}},
      {t:68,  shot:'severin_closeup', p:{mood:'neutral', bg:'garden', pan:'in'}},
      {t:74,  shot:'ilse_closeup', p:{mood:'neutral', bg:'garden', pan:'none'}},
      {t:80,  shot:'severin_closeup', p:{mood:'soft', bg:'garden', pan:'none'}},
      {t:87,  shot:'severin_garden', p:{pan:'left'}},
      {t:96,  shot:'severin_closeup', p:{mood:'soft', bg:'garden', pan:'none'}},
      {t:101, shot:'ilse_closeup', p:{mood:'neutral', bg:'garden', pan:'in'}},
      {t:114, shot:'tomato_closeup'}
    ],
    music: [
      {t:0,   cue:'severin_theme', fade:4},
      {t:88,  cue:'silence', fade:3},
      {t:106, cue:'tension', fade:8}
    ],
    sfx: [
      {t:88, sfx:'footsteps'}
    ],
    lines: [
      L(9,    'SEVERIN', 'Mind the hose. It bites.'),
      L(20.5, 'SEVERIN', 'They want twelve hours of light. The Authority gives me eleven.'),
      L(27.3, 'ILSE',    'And the twelfth?'),
      L(31.5, 'SEVERIN', 'I steal it. Nobody misses an hour.'),
      L(38,   'SEVERIN', 'Don\'t refrigerate it. It loses its soul.'),
      L(45,   'ILSE',    'You grew this under stolen light.'),
      L(50.5, 'SEVERIN', 'All light on Vesper is stolen, Ilse.'),
      L(58,   'SEVERIN', 'They\'re building hulls on Thale.'),
      L(63.2, 'ILSE',    'They\'re building ice tugs on Thale.'),
      L(68.5, 'SEVERIN', 'Tugs with armored bows. I have a file.'),
      L(75,   'ILSE',    'I don\'t want to see it.'),
      L(80.5, 'SEVERIN', 'No. You never did like reading ahead.'),
      L(91,   'SEVERIN', 'Your daughter keeps interesting company, Ilse.'),
      L(97,   'SEVERIN', 'The docks are cold at night.')
    ],
    cards: [
      {t:2, d:5, text:'ADMIRALTY RESIDENCE · GROW DECK', style:'location'}
    ]
  }));

  // ───────────────────────────────────────────── s04 — The Hold
  window.LD_SCRIPT.push(scene(A1, {
    id: 's04', title: 'Cold Hands', duration: 130,
    shots: [
      {t:0,   shot:'kestrel_moth_exterior'},
      {t:8,   shot:'hold_trio'},
      {t:20,  shot:'device_closeup', p:{codes:'right'}},
      {t:27,  shot:'mira_closeup', p:{mood:'neutral', bg:'ship'}},
      {t:32,  shot:'juno_closeup', p:{mood:'neutral', bg:'ship'}},
      {t:37,  shot:'hold_trio', p:{pan:'in'}},
      {t:50,  shot:'teo_closeup', p:{mood:'soft', bg:'ship'}},
      {t:55.5,shot:'juno_closeup', p:{mood:'neutral', bg:'ship', pan:'none'}},
      {t:60,  shot:'teo_closeup', p:{mood:'neutral', bg:'ship', pan:'none'}},
      {t:66,  shot:'mira_closeup', p:{mood:'soft', bg:'ship', pan:'in'}},
      {t:74,  shot:'shelf_haulers', p:{pan:'right'}},
      {t:80,  shot:'juno_mira_cockpit'},
      {t:92,  shot:'juno_closeup', p:{mood:'tired', bg:'ship', pan:'none'}},
      {t:106, shot:'mira_closeup', p:{mood:'neutral', bg:'ship'}},
      {t:113, shot:'juno_closeup', p:{mood:'soft', bg:'ship', pan:'none'}},
      {t:120, shot:'juno_mira_cockpit', p:{pan:'out'}}
    ],
    music: [
      {t:0,   cue:'juno_theme', fade:3},
      {t:56,  cue:'silence', fade:3},
      {t:63,  cue:'shelf_song', fade:3},
      {t:78,  cue:'silence', fade:5},
      {t:113, cue:'juno_theme', fade:6}
    ],
    sfx: [
      {t:5,  sfx:'airlock'},
      {t:21, sfx:'console_beep'},
      {t:80, sfx:'metal_creak'}
    ],
    lines: [
      L(9,    'JUNO', 'Don\'t touch the red one.'),
      L(22.5, 'JUNO', 'Dockmaster says it\'s clean.'),
      L(27.5, 'MIRA', 'Did he look at it?'),
      L(32,   'JUNO', 'He\'s paid to look at things.'),
      L(38,   'TEO',  'Ninety seconds. Then the petals roll back on their own.'),
      L(44.5, 'MIRA', 'Nobody gets hurt. Names, just names.'),
      L(51,   'TEO',  'My cousin\'s name is very long.'),
      L(56,   'JUNO', 'We\'ll use a small font.'),
      L(64,   'TEO',  'Cold hands haul, cold hands bring...', true),
      L(69.5, 'TEO',  '...ice for the kings who never sing.', true),
      L(94,   'MIRA', 'Is your brother\'s name on it?'),
      L(101,  'JUNO', 'Depends which list you\'re reading.'),
      L(108,  'MIRA', 'Does it change anything? Words?'),
      L(115,  'JUNO', 'Not usually.'),
      L(119.5,'JUNO', 'Do it anyway.')
    ],
    cards: [
      {t:1.5, d:5, text:'KESTREL MOTH · SPINDLE DOCK 9', style:'location'}
    ]
  }));

  // ───────────────────────────────────────────── s05 — The Terrace
  window.LD_SCRIPT.push(scene(A1, {
    id: 's05', title: 'The Letter', duration: 140,
    shots: [
      {t:0,   shot:'reception_terrace', p:{pan:'right'}},
      {t:10,  shot:'ilse_closeup', p:{mood:'tired', bg:'terrace'}},
      {t:17,  shot:'ilse_kasimir_terrace'},
      {t:30,  shot:'kasimir_closeup', p:{mood:'neutral', bg:'terrace'}},
      {t:33,  shot:'ilse_closeup', p:{mood:'neutral', bg:'terrace'}},
      {t:38,  shot:'ilse_kasimir_terrace', p:{pan:'none'}},
      {t:48,  shot:'ilse_closeup', p:{mood:'neutral', bg:'terrace', pan:'none'}},
      {t:53,  shot:'kasimir_closeup', p:{mood:'soft', bg:'terrace'}},
      {t:58,  shot:'ilse_closeup', p:{mood:'neutral', bg:'terrace', pan:'none'}},
      {t:62,  shot:'kasimir_closeup', p:{mood:'soft', bg:'terrace', pan:'none'}},
      {t:66,  shot:'ilse_closeup', p:{mood:'tired', bg:'terrace'}},
      {t:71,  shot:'kasimir_closeup', p:{mood:'soft', bg:'terrace', pan:'none'}},
      {t:75,  shot:'ilse_eyes', p:{mood:'grief'}},
      {t:79,  shot:'ilse_kasimir_terrace', p:{pan:'out'}},
      {t:86,  shot:'kasimir_closeup', p:{mood:'tired', bg:'terrace', pan:'in'}},
      {t:91,  shot:'ilse_closeup', p:{mood:'soft', bg:'terrace', pan:'none'}},
      {t:97,  shot:'kasimir_eyes', p:{mood:'soft'}},
      {t:103, shot:'ilse_kasimir_terrace', p:{close:true}},
      {t:113, shot:'ilse_closeup', p:{mood:'neutral', bg:'terrace', pan:'none'}},
      {t:119, shot:'kasimir_closeup', p:{mood:'neutral', bg:'terrace', pan:'none'}},
      {t:123, shot:'ilse_closeup', p:{mood:'tired', bg:'terrace', pan:'up'}},
      {t:129, shot:'vesper_exterior', p:{light:0.02, pan:'out'}}
    ],
    music: [
      {t:0,   cue:'reception_jazz', fade:3},
      {t:40,  cue:'silence', fade:6},
      {t:80,  cue:'ilse_kasimir', fade:8},
      {t:124, cue:'silence', fade:6},
      {t:130, cue:'dusk_ambience', fade:6}
    ],
    sfx: [
      {t:1,   sfx:'crowd_murmur'},
      {t:4,   sfx:'clink'},
      {t:31,  sfx:'clink'},
      {t:122, sfx:'footsteps'}
    ],
    lines: [
      L(18,   'KASIMIR', 'They gave me a glass of something blue.'),
      L(23.5, 'ILSE',    'Don\'t drink it. It\'s for the photographs.'),
      L(29.5, 'KASIMIR', 'I drank it.'),
      L(33.5, 'ILSE',    'Then you\'re a diplomat now.'),
      L(44,   'KASIMIR', 'You cut your hair.'),
      L(48.5, 'ILSE',    'Twelve years ago.'),
      L(54,   'KASIMIR', 'How is she? Mira.'),
      L(58.5, 'ILSE',    'Seventeen.'),
      L(62.5, 'KASIMIR', 'That bad.'),
      L(66,   'ILSE',    'Worse. She\'s right about things.'),
      L(72,   'KASIMIR', 'She has his—'),
      L(75.5, 'ILSE',    'Don\'t.'),
      L(87,   'KASIMIR', 'I wrote to you once.'),
      L(93,   'ILSE',    'I know. I kept it.'),
      L(104,  'KASIMIR', 'There are people on my side who want this to fail.'),
      L(110.5,'KASIMIR', 'Not only on yours.'),
      L(115,  'ILSE',    'Is that a warning?'),
      L(119.5,'KASIMIR', 'Good night, Ilse.')
    ],
    cards: [
      {t:2, d:5, text:'CONCORDAT RECEPTION · UPPER TERRACE', style:'location'}
    ]
  }));

  // ───────────────────────────────────────────── s06 — The Spine
  window.LD_SCRIPT.push(scene(A2, {
    id: 's06', title: 'The Spine', duration: 120,
    shots: [
      {t:0,   shot:'black'},
      {t:6,   shot:'vesper_exterior', p:{light:0, pan:'in'}},
      {t:12,  shot:'maintenance_spine', p:{pan:'in'}},
      {t:20,  shot:'spine_mira_teo'},
      {t:32,  shot:'mira_closeup', p:{mood:'neutral', bg:'spine'}},
      {t:38,  shot:'teo_closeup', p:{mood:'soft', bg:'spine'}},
      {t:45,  shot:'spine_mira_teo', p:{pan:'left'}},
      {t:52,  shot:'device_closeup', p:{codes:'right'}},
      {t:60,  shot:'mira_closeup', p:{mood:'neutral', bg:'spine', pan:'none'}},
      {t:64,  shot:'device_closeup', p:{codes:'wrong', pan:'in'}},
      {t:72,  shot:'mira_eyes', p:{mood:'fear'}},
      {t:78,  shot:'teo_closeup', p:{mood:'neutral', bg:'spine', pan:'none'}},
      {t:82,  shot:'mira_closeup', p:{mood:'fear', bg:'spine', pan:'none'}},
      {t:87,  shot:'teo_closeup', p:{mood:'soft', bg:'spine', pan:'none'}},
      {t:91,  shot:'mira_closeup', p:{mood:'fear', bg:'spine', pan:'in'}},
      {t:98,  shot:'device_closeup', p:{codes:'wrong', pan:'none'}},
      {t:102, shot:'hands', p:{who:'mira_teo', touch:true}},
      {t:110, shot:'maintenance_spine', p:{pan:'out'}}
    ],
    music: [
      {t:0,   cue:'silence', fade:1},
      {t:12,  cue:'tension', fade:8},
      {t:64,  cue:'silence', fade:2},
      {t:100, cue:'mira_theme', fade:6},
      {t:113, cue:'silence', fade:7}
    ],
    sfx: [
      {t:12,  sfx:'wind_vent'},
      {t:24,  sfx:'metal_creak'},
      {t:53,  sfx:'console_beep'},
      {t:65,  sfx:'console_beep'},
      {t:67,  sfx:'heartbeat'},
      {t:91,  sfx:'radio_static'},
      {t:101, sfx:'metal_creak'}
    ],
    lines: [
      L(21,   'RADIO', 'Kestrel to mice. You\'re past the third rib.', true),
      L(27,   'TEO',   'Why are we mice?'),
      L(31,   'RADIO', 'Because you\'re small and I\'m not.', true),
      L(36.5, 'MIRA',  'Teo. Your hands.'),
      L(40.5, 'TEO',   'They\'re Shelf hands. They don\'t feel it.'),
      L(55,   'RADIO', 'Array sync in four minutes. I\'m counting.', true),
      L(74,   'MIRA',  'These aren\'t the numbers.'),
      L(78.5, 'TEO',   'What?'),
      L(82.5, 'MIRA',  'The signature. I\'ve never seen it.'),
      L(87.5, 'TEO',   'Juno checked.'),
      L(91.5, 'RADIO', 'Mice. Two-forty. Talk to me.', true),
      L(105,  'RADIO', 'Mira?', true),
      L(109,  'MIRA',  'Done. It\'s done.')
    ],
    cards: [
      {t:0.5, d:5, text:'ACT II — THE MIRROR', jp:'鏡', style:'act'},
      {t:13,  d:5, text:'MIRROR ARRAY · MAINTENANCE SPINE 4', style:'location'}
    ]
  }));

  // ───────────────────────────────────────────── s07 — The Incident
  window.LD_SCRIPT.push(scene(A2, {
    id: 's07', title: 'The Incident', duration: 110,
    shots: [
      {t:0,   shot:'vesper_exterior', p:{light:0.1, pan:'in'}},
      {t:8,   shot:'mira_closeup', p:{mood:'neutral', bg:'dock'}},
      {t:14,  shot:'mirror_petals_close', p:{opening:true}},
      {t:22,  shot:'vesper_exterior', p:{light:0.6, pan:'none'}},
      {t:26,  shot:'mirror_tear'},
      {t:36,  shot:'mira_eyes', p:{mood:'fear'}},
      {t:39,  shot:'fire_agri_ring'},
      {t:44,  shot:'vesper_exterior', p:{damaged:true, light:0.5, pan:'out'}},
      {t:48,  shot:'maintenance_spine', p:{alarm:true, pan:'none'}},
      {t:51,  shot:'fire_agri_ring', p:{pan:'in'}},
      {t:55,  shot:'dock_exterior', p:{pan:'none'}},
      {t:59,  shot:'mirror_petals_close', p:{pan:'none'}},
      {t:64,  shot:'vesper_exterior', p:{damaged:true, dark:true, light:0}},
      {t:70,  shot:'black'},
      {t:74,  shot:'dark_habitat', p:{pan:'up'}},
      {t:86,  shot:'mira_docks_fire'},
      {t:100, shot:'mira_closeup', p:{mood:'fear', dark:true, bg:'dock', pan:'none'}}
    ],
    music: [
      {t:0,  cue:'silence', fade:1},
      {t:26, cue:'incident', fade:0.5},
      {t:64, cue:'silence', fade:2},
      {t:76, cue:'dusk_ambience', fade:10}
    ],
    sfx: [
      {t:1,  sfx:'pa_chime'},
      {t:14, sfx:'mirror_motor'},
      {t:26.7, sfx:'metal_creak'},
      {t:27.9, sfx:'impact'},
      {t:36, sfx:'heartbeat'},
      {t:39, sfx:'fire_roar'},
      {t:40, sfx:'alarm'},
      {t:48, sfx:'alarm'},
      {t:52, sfx:'impact'},
      {t:53, sfx:'fire_roar'},
      {t:57, sfx:'pa_chime'},
      {t:60, sfx:'mirror_motor'},
      {t:63, sfx:'hum_stop'},
      {t:86, sfx:'fire_roar'}
    ],
    lines: [
      L(2.5, 'PA', 'Mirror Authority. Petal array opening. Day cycle begins.'),
      L(41,  'PA', 'Emergency. Agricultural Ring Two. Clear the sector.'),
      L(47,  '',   '(alarms)'),
      L(52,  'PA', 'Fire crews to Spindle Dock 9.'),
      L(57.5,'PA', 'Array emergency lock. Do not look at the sky.'),
      L(95,  '',   '(sirens, far away)')
    ],
    cards: [
      {t:76, d:6, text:'THE LONG DUSK', style:'chapter'}
    ]
  }));

  // ───────────────────────────────────────────── s08 — Emergency Council
  window.LD_SCRIPT.push(scene(A2, {
    id: 's08', title: 'Seventy-Two Hours', duration: 130,
    shots: [
      {t:0,   shot:'council_chamber_emergency', p:{pan:'in'}},
      {t:8,   shot:'newsfeed', p:{headline:'31 CONFIRMED'}},
      {t:14,  shot:'severin_closeup', p:{mood:'neutral', dark:true, bg:'hall'}},
      {t:24,  shot:'council_chamber_emergency', p:{pan:'left'}},
      {t:30,  shot:'severin_closeup', p:{mood:'resolve', dark:true, bg:'hall', pan:'in'}},
      {t:38,  shot:'ilse_closeup', p:{mood:'tired', dark:true, bg:'hall'}},
      {t:48,  shot:'severin_closeup', p:{mood:'soft', dark:true, bg:'hall', pan:'none'}},
      {t:59,  shot:'ilse_eyes', p:{mood:'resolve', dark:true}},
      {t:65,  shot:'newsfeed', p:{headline:'SHELF NATIONAL DETAINED'}},
      {t:72,  shot:'corridor', p:{dark:true, pan:'in'}},
      {t:80,  shot:'kasimir_closeup', p:{mood:'tired', dark:true, bg:'detention', pan:'none'}},
      {t:92,  shot:'corridor', p:{dark:true, pan:'out'}},
      {t:98,  shot:'dark_habitat', p:{pan:'right'}},
      {t:108, shot:'ilse_closeup', p:{mood:'resolve', dark:true, bg:'dark', pan:'in'}},
      {t:120, shot:'severin_gallery', p:{dark:true}}
    ],
    music: [
      {t:0,   cue:'tension', fade:3},
      {t:14,  cue:'severin_theme', fade:5},
      {t:60,  cue:'silence', fade:4},
      {t:96,  cue:'dusk_ambience', fade:8},
      {t:118, cue:'severin_theme', fade:6}
    ],
    sfx: [
      {t:0,  sfx:'crowd_murmur'},
      {t:3,  sfx:'gavel'},
      {t:24, sfx:'crowd_murmur'},
      {t:72, sfx:'footsteps'},
      {t:93, sfx:'door'}
    ],
    lines: [
      L(9,    'NEWS',    'Thirty-one confirmed. Recovery continues in Ring Two.'),
      L(15.5, 'SEVERIN', 'Nobody in this room wants a war.'),
      L(20.5, 'SEVERIN', 'But someone has brought one into our sky.'),
      L(26.5, 'SEVERIN', 'I ask the council to suspend the talks.'),
      L(32,   'SEVERIN', 'And to bring the fleet to readiness. Only readiness.'),
      L(39.5, 'ILSE',    'Seventy-two hours.'),
      L(43.5, 'ILSE',    'Before anyone arms anything.'),
      L(50,   'SEVERIN', 'Seventy-two hours.'),
      L(55,   'SEVERIN', 'The dark will wait.'),
      L(66,   'NEWS',    'A Shelf national has been detained in connection with—'),
      L(73,   'AIDE',    'The Shelf delegate. They\'ve moved him.'),
      L(78.3, 'ILSE',    'Moved him where?'),
      L(82.2, 'AIDE',    'A suite. For his protection.'),
      L(88,   'GUARD',   'This way, Delegate.'),
      L(100,  'NEWS',    'The Authority says the array will remain closed until further notice.')
    ],
    cards: [
      {t:1, d:5, text:'EMERGENCY COUNCIL · ADMIRALTY', style:'location'}
    ]
  }));

  // ───────────────────────────────────────────── s09 — Tea
  window.LD_SCRIPT.push(scene(A2, {
    id: 's09', title: 'Tea', duration: 120,
    shots: [
      {t:0,   shot:'dark_habitat', p:{pan:'left'}},
      {t:8,   shot:'ilse_closeup', p:{mood:'tired', dark:true, bg:'apartment', pan:'none'}},
      {t:18,  shot:'photo_daniel', p:{dark:true}},
      {t:23,  shot:'ilse_mira_kitchen', p:{dark:true, pan:'none'}},
      {t:34,  shot:'ilse_closeup', p:{mood:'neutral', dark:true, bg:'apartment', pan:'none'}},
      {t:40,  shot:'ilse_mira_kitchen', p:{dark:true, tea:true}},
      {t:52,  shot:'mira_closeup', p:{mood:'grief', dark:true, bg:'apartment', pan:'none'}},
      {t:58,  shot:'ilse_closeup', p:{mood:'tired', dark:true, bg:'apartment', pan:'none'}},
      {t:63,  shot:'mira_closeup', p:{mood:'grief', dark:true, bg:'apartment', pan:'in'}},
      {t:75,  shot:'ilse_closeup', p:{mood:'grief', dark:true, bg:'apartment', pan:'none'}},
      {t:83,  shot:'ilse_mira_kitchen', p:{dark:true, tea:true, pan:'none'}},
      {t:88,  shot:'hands', p:{who:'ilse_mira', touch:true}},
      {t:96,  shot:'ilse_closeup', p:{mood:'neutral', dark:true, bg:'apartment', pan:'none'}},
      {t:103, shot:'mira_eyes', p:{mood:'fear', dark:true}},
      {t:109, shot:'cigarette_closeup', p:{pan:'none'}},
      {t:115, shot:'photo_daniel', p:{dark:true}}
    ],
    music: [
      {t:0,   cue:'dusk_ambience', fade:4},
      {t:18,  cue:'silence', fade:4},
      {t:63,  cue:'grief', fade:8},
      {t:97,  cue:'silence', fade:4}
    ],
    sfx: [
      {t:16,  sfx:'hum_stop'},
      {t:20,  sfx:'door'},
      {t:42,  sfx:'teacup'},
      {t:47,  sfx:'teacup'},
      {t:84,  sfx:'teacup'}
    ],
    lines: [
      L(2,    'NEWS', 'Ring Two is being sealed. Residents should stay indoors.'),
      L(9,    'NEWS', 'Lantern rations at district depots from oh-six-hundred.'),
      L(30,   'MIRA', 'The trams aren\'t running.'),
      L(36,   'ILSE', 'Sit down.'),
      L(44,   'ILSE', 'It\'s the last of the green. The shops are shut.'),
      L(53.5, 'MIRA', 'You know.'),
      L(59,   'ILSE', 'Drink it while it\'s hot.'),
      L(66,   'MIRA', 'It was supposed to be words.'),
      L(71.5, 'MIRA', 'Only words.'),
      L(93,   'ILSE', 'You\'re cold.'),
      L(99,   'ILSE', 'Who gave you the codes?'),
      L(105,  'MIRA', 'I—')
    ],
    cards: []
  }));

  // ───────────────────────────────────────────── s10 — The Seal
  window.LD_SCRIPT.push(scene(A2, {
    id: 's10', title: 'Licorice', duration: 130,
    shots: [
      {t:0,   shot:'dock_exterior', p:{pan:'in'}},
      {t:7,   shot:'freighter_cockpit_empty'},
      {t:15,  shot:'juno_closeup', p:{mood:'tired', dark:true, bg:'ship'}},
      {t:24,  shot:'device_closeup', p:{codes:'wrong', pan:'in'}},
      {t:32,  shot:'juno_closeup', p:{mood:'anger', dark:true, bg:'ship', pan:'none'}},
      {t:44,  shot:'corridor', p:{dark:true, pan:'in'}},
      {t:52,  shot:'juno_closeup', p:{mood:'neutral', dark:true, bg:'dock'}},
      {t:60,  shot:'dock_exterior', p:{pan:'none'}},
      {t:66,  shot:'juno_closeup', p:{mood:'tired', dark:true, bg:'dock', pan:'none'}},
      {t:71,  shot:'freighter_cockpit_empty', p:{pan:'none'}},
      {t:82,  shot:'juno_closeup', p:{mood:'fear', dark:true, bg:'ship', pan:'in'}},
      {t:90,  shot:'freighter_cockpit_empty', p:{pan:'none'}},
      {t:94,  shot:'juno_closeup', p:{mood:'grief', dark:true, bg:'ship', pan:'none'}},
      {t:108, shot:'licorice_snap'},
      {t:116, shot:'juno_closeup', p:{mood:'tired', dark:true, bg:'ship', pan:'none'}},
      {t:124, shot:'kestrel_moth_exterior', p:{pan:'out'}}
    ],
    music: [
      {t:0,   cue:'dusk_ambience', fade:4},
      {t:24,  cue:'tension', fade:6},
      {t:60,  cue:'silence', fade:2},
      {t:104, cue:'juno_theme', fade:10}
    ],
    sfx: [
      {t:1,   sfx:'radio_static'},
      {t:18,  sfx:'console_beep'},
      {t:25,  sfx:'console_beep'},
      {t:44,  sfx:'footsteps'},
      {t:53,  sfx:'door'},
      {t:72,  sfx:'radio_static'},
      {t:89,  sfx:'impact'}
    ],
    lines: [
      L(2,    'RADIO', 'Dock control. All berths remain sealed. No departures.', true),
      L(10.5, 'JUNO',  'Come on, you old moth.'),
      L(20,   'JUNO',  'Again.'),
      L(26,   'JUNO',  'Show me your face.'),
      L(34,   'JUNO',  'That\'s not a dock seal.'),
      L(38.5, 'JUNO',  'That\'s a Concordat security seal.'),
      L(50,   'JUNO',  'Pell?'),
      L(55,   'JUNO',  'Pell. You owe me a drink.'),
      L(67,   'JUNO',  'His coffee\'s still warm.'),
      L(73,   'RADIO', '—all berths. Shelf national detained at Rib Six—', true),
      L(79,   'RADIO', '—Marsh. Teo Marsh. Nineteen. No fixed—', true),
      L(97,   'RADIO', '—repeat, all berths—', true)
    ],
    cards: []
  }));
})();
