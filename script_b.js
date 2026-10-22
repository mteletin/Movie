/* LONG DUSK — script_b.js — scenes s11–s18 (ACT III DUSK, ACT IV LONG DUSK).
   s19 (credits) is rendered by the engine. */
(function(){
  window.LD_SCRIPT = window.LD_SCRIPT || [];

  // Subtitle helper: display duration = 2.5s + 0.06s per character, rounded to 0.1s.
  function L(t, who, text, it){
    var o = { t: t, d: Math.round((2.5 + 0.06 * text.length) * 10) / 10, who: who, text: text };
    if (it) o.it = true;
    return o;
  }

  var A3 = { act: 3, actTitle: 'DUSK', actTitleJp: '黄昏' };
  var A4 = { act: 4, actTitle: 'LONG DUSK', actTitleJp: '長い黄昏' };
  function scene(a, o){ o.act = a.act; o.actTitle = a.actTitle; o.actTitleJp = a.actTitleJp; return o; }

  // ───────────────────────────────────────────── s11 — Detention suite
  window.LD_SCRIPT.push(scene(A3, {
    id: 's11', title: 'The Window', duration: 140,
    shots: [
      {t:0,   shot:'dark_habitat', p:{dark:true, pan:'right'}},
      {t:9,   shot:'corridor', p:{dark:true, pan:'in'}},
      {t:17,  shot:'ilse_kasimir_detention', p:{dark:true}},
      {t:30,  shot:'kasimir_closeup', p:{mood:'soft', dark:true, bg:'detention'}},
      {t:38,  shot:'ilse_closeup', p:{mood:'tired', dark:true, bg:'detention'}},
      {t:50,  shot:'ilse_eyes', p:{mood:'grief', dark:true}},
      {t:58,  shot:'kasimir_eyes', p:{mood:'neutral', dark:true}},
      {t:66,  shot:'ilse_closeup', p:{mood:'tired', dark:true, bg:'detention'}},
      {t:73,  shot:'data_chip', p:{}},
      {t:80,  shot:'kasimir_closeup', p:{mood:'resolve', dark:true, bg:'detention'}},
      {t:88,  shot:'ilse_closeup', p:{mood:'anger', dark:true, bg:'detention'}},
      {t:96,  shot:'memory_daniel', p:{}},
      {t:104, shot:'kasimir_closeup', p:{mood:'grief', dark:true, bg:'detention'}},
      {t:112, shot:'ilse_closeup', p:{mood:'soft', dark:true, bg:'detention'}},
      {t:120, shot:'hands', p:{who:'ilse_kasimir', touch:true}},
      {t:129, shot:'ilse_kasimir_detention', p:{dark:true, pan:'out'}}
    ],
    music: [
      {t:0,   cue:'dusk_ambience', fade:4},
      {t:94,  cue:'ilse_kasimir', fade:4},
      {t:128, cue:'silence', fade:8}
    ],
    sfx: [
      {t:10,  sfx:'footsteps'},
      {t:16,  sfx:'door'},
      {t:74,  sfx:'clink'},
      {t:131, sfx:'door'}
    ],
    lines: [
      L(24,  'KASIMIR', 'They gave me a window.'),
      L(29,  'ILSE',    'It\'s painted.'),
      L(33,  'KASIMIR', 'I noticed. I\'m being polite about it.'),
      L(44,  'KASIMIR', 'Ilse. Sit down.'),
      L(52,  'ILSE',    'Mira hasn\'t been sleeping.'),
      L(57,  'ILSE',    'She came home that morning smelling of smoke.'),
      L(64,  'KASIMIR', 'How old is she now?'),
      L(69,  'ILSE',    'Old enough.'),
      L(74,  'KASIMIR', 'Roe kept a second channel. He thinks I don\'t read his mail.'),
      L(81,  'KASIMIR', 'Your admiral and my deputy have been writing to each other.'),
      L(98,  'DANIEL',  'Kas, tell her it was your idea.', true),
      L(107, 'KASIMIR', 'Daniel would have known what to do.'),
      L(113, 'ILSE',    'Daniel would have done the wrong thing beautifully.'),
      L(132, 'GUARD',   'Time.')
    ],
    cards: [
      {t:1,  d:6, text:'ACT III — DUSK', jp:'黄昏', style:'act'},
      {t:11, d:5, text:'DETENTION SUITE · ADMINISTRATIVE RING', style:'location'}
    ]
  }));

  // ───────────────────────────────────────────── s12 — The garden in the dark
  window.LD_SCRIPT.push(scene(A3, {
    id: 's12', title: 'Wilting', duration: 120,
    shots: [
      {t:0,   shot:'severin_garden', p:{dark:true, wilted:true, pan:'right'}},
      {t:10,  shot:'tomato_closeup', p:{wilted:true}},
      {t:16,  shot:'ilse_severin_garden', p:{dark:true, wilted:true}},
      {t:26,  shot:'ilse_closeup', p:{mood:'anger', dark:true, bg:'garden'}},
      {t:32,  shot:'severin_closeup', p:{mood:'neutral', dark:true, bg:'garden'}},
      {t:44,  shot:'ilse_severin_garden', p:{dark:true, wilted:true, pan:'in'}},
      {t:52,  shot:'ilse_eyes', p:{mood:'fear', dark:true}},
      {t:60,  shot:'severin_closeup', p:{mood:'soft', dark:true, bg:'garden'}},
      {t:74,  shot:'helmet_closeup', p:{}},
      {t:82,  shot:'severin_closeup', p:{mood:'grief', dark:true, bg:'garden'}},
      {t:91,  shot:'ilse_closeup', p:{mood:'grief', dark:true, bg:'garden'}},
      {t:99,  shot:'tomato_closeup', p:{wilted:true, offer:true}},
      {t:106, shot:'severin_garden', p:{dark:true, wilted:true, pan:'out'}}
    ],
    music: [
      {t:0,   cue:'dusk_ambience', fade:3},
      {t:42,  cue:'severin_theme', fade:6},
      {t:104, cue:'silence', fade:8}
    ],
    sfx: [
      {t:4,   sfx:'hum_stop'},
      {t:107, sfx:'footsteps'},
      {t:114, sfx:'door'}
    ],
    lines: [
      L(19,  'SEVERIN', 'They think the lamps are the sun. Then the sun goes out.'),
      L(27,  'ILSE',    'Roe.'),
      L(35,  'SEVERIN', 'I don\'t know the name.'),
      L(40,  'ILSE',    'He knows yours.'),
      L(46,  'SEVERIN', 'I didn\'t kill those people. A girl with a soldering iron did.'),
      L(61,  'SEVERIN', 'Nobody needs to know which girl.'),
      L(67,  'SEVERIN', 'The talks are already dead, Ilse. Let them be buried.'),
      L(75,  'SEVERIN', 'He hated this helmet. Said it pinched.'),
      L(84,  'SEVERIN', 'We buried the same war, Ilse. I just kept digging.'),
      L(100, 'SEVERIN', 'Take one. They won\'t last.')
    ],
    cards: []
  }));

  // ───────────────────────────────────────────── s13 — Interrogation / the dock
  window.LD_SCRIPT.push(scene(A3, {
    id: 's13', title: 'Cold Hands', duration: 100,
    shots: [
      {t:0,  shot:'interrogation_room', p:{withTeo:true, pan:'in'}},
      {t:10, shot:'teo_closeup', p:{mood:'fear', dark:true, bg:'detention'}},
      {t:20, shot:'interrogation_room', p:{withTeo:true, pan:'none'}},
      {t:26, shot:'teo_closeup', p:{mood:'anger', dark:true, bg:'detention'}},
      {t:38, shot:'dock_exterior', p:{dark:true, pan:'left'}},
      {t:44, shot:'juno_closeup', p:{mood:'tired', dark:true, bg:'dock'}},
      {t:51, shot:'mira_closeup', p:{mood:'tired', dark:true, bg:'dock'}},
      {t:57, shot:'juno_closeup', p:{mood:'anger', dark:true, bg:'dock'}},
      {t:70, shot:'mira_eyes', p:{mood:'resolve', dark:true}},
      {t:80, shot:'juno_closeup', p:{mood:'grief', dark:true, bg:'dock'}},
      {t:88, shot:'dock_exterior', p:{dark:true, pan:'out'}}
    ],
    music: [
      {t:0,  cue:'silence', fade:2},
      {t:38, cue:'juno_theme', fade:4},
      {t:84, cue:'silence', fade:8}
    ],
    sfx: [
      {t:20, sfx:'door'},
      {t:22, sfx:'footsteps'},
      {t:39, sfx:'wind_vent'}
    ],
    lines: [
      L(8,  'TEO',   'Cold hands haul, cold hands bring...', true),
      L(15, 'TEO',   'ice for the kings who never sing', true),
      L(23, 'GUARD', 'Quiet.'),
      L(33, 'TEO',   '...cold hands haul.', true),
      L(45, 'JUNO',  'You\'re hard to find for someone who doesn\'t hide.'),
      L(53, 'MIRA',  'Is he—'),
      L(57, 'JUNO',  'Security annex. They won\'t let me near.'),
      L(63, 'JUNO',  'They\'ll hang him for it, Mira. Shelf boy. It\'s a gift for them.'),
      L(78, 'MIRA',  'Then I\'ll tell them.')
    ],
    cards: [
      {t:2, d:5, text:'SECURITY ANNEX · LEVEL 4', style:'location'}
    ]
  }));

  // ───────────────────────────────────────────── s14 — The window
  window.LD_SCRIPT.push(scene(A3, {
    id: 's14', title: 'Watch Me', duration: 110,
    shots: [
      {t:0,  shot:'dark_habitat', p:{dark:true, pan:'left'}},
      {t:8,  shot:'ilse_mira_window', p:{dark:true}},
      {t:19, shot:'ilse_closeup', p:{mood:'neutral', dark:true, bg:'apartment'}},
      {t:24, shot:'mira_closeup', p:{mood:'anger', dark:true, bg:'apartment'}},
      {t:31, shot:'ilse_closeup', p:{mood:'tired', dark:true, bg:'apartment'}},
      {t:39, shot:'mira_closeup', p:{mood:'fear', dark:true, bg:'apartment'}},
      {t:48, shot:'ilse_mira_window', p:{dark:true, pan:'none'}},
      {t:58, shot:'mira_eyes', p:{mood:'grief', dark:true}},
      {t:66, shot:'ilse_closeup', p:{mood:'resolve', dark:true, bg:'apartment'}},
      {t:72, shot:'mira_closeup', p:{mood:'soft', dark:true, bg:'apartment'}},
      {t:79, shot:'ilse_eyes', p:{mood:'resolve', dark:true}},
      {t:86, shot:'hands', p:{who:'ilse_mira', touch:true}},
      {t:96, shot:'ilse_mira_window', p:{dark:true, pan:'out'}}
    ],
    music: [
      {t:0,   cue:'dusk_ambience', fade:3},
      {t:64,  cue:'ilse_theme', fade:6},
      {t:104, cue:'silence', fade:6}
    ],
    sfx: [
      {t:55, sfx:'wind_vent'}
    ],
    lines: [
      L(14,  'MIRA', 'I\'m going to the annex tomorrow. Nine o\'clock.'),
      L(21,  'ILSE', 'They don\'t open until ten.'),
      L(27,  'MIRA', 'Don\'t do that.'),
      L(33,  'MIRA', 'If I don\'t, he dies for me.'),
      L(40,  'ILSE', 'If you do, they\'ll say the Shelf used you. There\'s no version where you\'re believed.'),
      L(68,  'ILSE', 'Let me carry it.'),
      L(74,  'MIRA', 'You can\'t carry everything.'),
      L(81,  'ILSE', 'Watch me.'),
      L(92,  'MIRA', 'That was almost a joke.'),
      L(98,  'ILSE', 'Almost.')
    ],
    cards: []
  }));

  // ───────────────────────────────────────────── s15 — The final session
  window.LD_SCRIPT.push(scene(A4, {
    id: 's15', title: 'The Record', duration: 150,
    shots: [
      {t:0,   shot:'treaty_hall_wide', p:{dark:true, pan:'in'}},
      {t:9,   shot:'podium', p:{who:'chair', dark:true}},
      {t:18,  shot:'severin_gallery', p:{}},
      {t:24,  shot:'podium', p:{who:'ilse', dark:true}},
      {t:32,  shot:'ilse_closeup', p:{mood:'resolve', dark:true, bg:'hall'}},
      {t:46,  shot:'kasimir_closeup', p:{mood:'grief', dark:true, bg:'hall'}},
      {t:52,  shot:'newsfeed', p:{headline:'VARGA: DEVICE CAME FROM CONCORDAT HANDS'}},
      {t:57,  shot:'mira_closeup', p:{mood:'fear', dark:true, bg:'ship'}},
      {t:64,  shot:'ilse_closeup', p:{mood:'resolve', dark:true, bg:'hall'}},
      {t:70,  shot:'mira_eyes', p:{mood:'grief', dark:true}},
      {t:76,  shot:'severin_gallery', p:{}},
      {t:80,  shot:'data_chip', p:{}},
      {t:86,  shot:'severin_closeup', p:{mood:'neutral', dark:true, bg:'hall'}},
      {t:93,  shot:'treaty_hall_wide', p:{dark:true, pan:'none'}},
      {t:99,  shot:'podium', p:{who:'ilse', dark:true}},
      {t:107, shot:'kasimir_closeup', p:{mood:'resolve', dark:true, bg:'hall'}},
      {t:113, shot:'signature', p:{}},
      {t:120, shot:'mira_closeup', p:{mood:'soft', dark:true, bg:'ship'}},
      {t:124, shot:'severin_gallery', p:{pan:'out'}},
      {t:132, shot:'ilse_closeup', p:{mood:'tired', dark:true, bg:'hall'}},
      {t:139, shot:'podium', p:{who:'ilse', dark:true, pan:'out'}}
    ],
    music: [
      {t:0,   cue:'tension', fade:3},
      {t:22,  cue:'silence', fade:5},
      {t:96,  cue:'resolve', fade:8},
      {t:132, cue:'ilse_theme', fade:6}
    ],
    sfx: [
      {t:5,   sfx:'crowd_murmur'},
      {t:9,   sfx:'gavel'},
      {t:46,  sfx:'crowd_murmur'},
      {t:93,  sfx:'crowd_murmur'},
      {t:126, sfx:'footsteps'},
      {t:129, sfx:'gavel'}
    ],
    lines: [
      L(10,  'CHAIR', 'The session is resumed under emergency provision.'),
      L(17,  'CHAIR', 'The Concordat delegation has asked to be heard first.'),
      L(27,  'ILSE',  'Thirty-one people. I have their names.'),
      L(34,  'ILSE',  'The device that killed them did not come from the Shelf.'),
      L(41,  'ILSE',  'It came from Concordat hands. From my own house.'),
      L(65,  'ILSE',  'I knew. I said nothing.'),
      L(78,  'ILSE',  'I enter into the record a transmission received by this delegation.'),
      L(87,  'ILSE',  'I won\'t read the names. They know who they are.'),
      L(100, 'ILSE',  'I resign my office, effective at the close of this session.'),
      L(108, 'ILSE',  'Delegate Oduya. The floor is yours.'),
      L(116, 'CHAIR', 'The renewal is before the hall. Those in favour.'),
      L(129, 'CHAIR', 'Carried.')
    ],
    cards: [
      {t:1, d:6, text:'ACT IV — LONG DUSK', jp:'長い黄昏', style:'act'}
    ]
  }));

  // ───────────────────────────────────────────── s16 — The last tomato
  window.LD_SCRIPT.push(scene(A4, {
    id: 's16', title: 'The Last One', duration: 90,
    shots: [
      {t:0,  shot:'severin_garden', p:{dark:true, wilted:true, pan:'left'}},
      {t:10, shot:'severin_closeup', p:{mood:'tired', dark:true, bg:'garden'}},
      {t:18, shot:'helmet_closeup', p:{}},
      {t:26, shot:'severin_closeup', p:{mood:'grief', dark:true, bg:'garden'}},
      {t:36, shot:'officers_garden', p:{}},
      {t:42, shot:'severin_closeup', p:{mood:'soft', dark:true, bg:'garden'}},
      {t:54, shot:'tomato_closeup', p:{offer:true}},
      {t:62, shot:'officers_garden', p:{pan:'none'}},
      {t:70, shot:'severin_closeup', p:{mood:'neutral', dark:true, bg:'garden'}},
      {t:78, shot:'severin_garden', p:{dark:true, wilted:true, pan:'out'}}
    ],
    music: [
      {t:0,  cue:'severin_theme', fade:6},
      {t:34, cue:'silence', fade:4},
      {t:62, cue:'grief', fade:8}
    ],
    sfx: [
      {t:31, sfx:'footsteps'},
      {t:35, sfx:'door'}
    ],
    lines: [
      L(38, 'OFFICER', 'Admiral.'),
      L(48, 'SEVERIN', 'Mind the hoses. Everyone trips on the hoses.'),
      L(56, 'SEVERIN', 'It\'s the last one. Somebody should eat it.'),
      L(67, 'OFFICER', 'Sir.')
    ],
    cards: []
  }));

  // ───────────────────────────────────────────── s17 — The docks
  window.LD_SCRIPT.push(scene(A4, {
    id: 's17', title: 'Outbound', duration: 120,
    shots: [
      {t:0,   shot:'dock_exterior', p:{dark:true, pan:'right'}},
      {t:8,   shot:'teo_released', p:{}},
      {t:16,  shot:'juno_closeup', p:{mood:'soft', dark:true, bg:'dock'}},
      {t:24,  shot:'teo_closeup', p:{mood:'soft', dark:true, bg:'dock'}},
      {t:34,  shot:'dock_farewell', p:{}},
      {t:42,  shot:'mira_closeup', p:{mood:'tired', dark:true, bg:'dock'}},
      {t:47,  shot:'ilse_closeup', p:{mood:'soft', dark:true, bg:'dock'}},
      {t:52,  shot:'dock_farewell', p:{pan:'none'}},
      {t:61,  shot:'ilse_closeup', p:{mood:'tired', dark:true, bg:'dock'}},
      {t:68,  shot:'mira_closeup', p:{mood:'soft', dark:true, bg:'dock'}},
      {t:74,  shot:'dock_farewell', p:{hug:true}},
      {t:84,  shot:'kestrel_moth_exterior', p:{departing:true}},
      {t:94,  shot:'juno_mira_cockpit', p:{}},
      {t:104, shot:'ilse_closeup', p:{mood:'grief', dark:true, bg:'dock'}},
      {t:110, shot:'dock_exterior', p:{dark:true, pan:'out'}}
    ],
    music: [
      {t:0,  cue:'dusk_ambience', fade:3},
      {t:52, cue:'mira_theme', fade:5},
      {t:86, cue:'shelf_song', fade:4}
    ],
    sfx: [
      {t:8,  sfx:'airlock'},
      {t:82, sfx:'airlock'},
      {t:85, sfx:'metal_creak'}
    ],
    lines: [
      L(17,  'JUNO', 'You look terrible.'),
      L(22,  'TEO',  'They fed me. Sort of.'),
      L(27,  'JUNO', 'Get on the ship before somebody changes their mind.'),
      L(36,  'JUNO', 'Ten minutes. Then I\'m leaving with or without the cargo.'),
      L(43,  'MIRA', 'You didn\'t sleep.'),
      L(48,  'ILSE', 'Neither did you.'),
      L(58,  'MIRA', 'Will you write?'),
      L(63,  'ILSE', 'I\'m not good at answering.'),
      L(69,  'MIRA', 'Then practice on me.'),
      L(88,  'JUNO', '(humming) Cold hands haul, cold hands bring', true),
      L(96,  'JUNO', 'ice for the kings who never sing', true)
    ],
    cards: [
      {t:2, d:5, text:'SPINDLE DOCK 9 · OUTBOUND', style:'location'}
    ]
  }));

  // ───────────────────────────────────────────── s18 — Dawn
  window.LD_SCRIPT.push(scene(A4, {
    id: 's18', title: 'Dawn', duration: 120,
    shots: [
      {t:0,   shot:'vesper_exterior', p:{dark:true, light:0}},
      {t:8,   shot:'ilse_kasimir_observation', p:{light:0.05}},
      {t:18,  shot:'mirror_petals_close', p:{opening:true}},
      {t:28,  shot:'ilse_kasimir_observation', p:{dawn:true, light:0.2}},
      {t:38,  shot:'cigarette_closeup', p:{}},
      {t:48,  shot:'ilse_closeup', p:{mood:'soft', bg:'observation'}},
      {t:56,  shot:'kasimir_closeup', p:{mood:'soft', bg:'observation'}},
      {t:64,  shot:'ilse_closeup', p:{mood:'grief', bg:'observation'}},
      {t:72,  shot:'cigarette_closeup', p:{give:true}},
      {t:82,  shot:'ilse_kasimir_observation', p:{dawn:true, light:0.6}},
      {t:96,  shot:'vesper_exterior', p:{light:1}},
      {t:104, shot:'orrin_rise', p:{light:1, pan:'up'}}
    ],
    music: [
      {t:0,   cue:'dusk_ambience', fade:2},
      {t:16,  cue:'ilse_kasimir', fade:8},
      {t:82,  cue:'finale', fade:6},
      {t:114, cue:'silence', fade:6}
    ],
    sfx: [
      {t:16, sfx:'mirror_motor'},
      {t:40, sfx:'lighter'}
    ],
    lines: [
      L(32, 'KASIMIR', 'Someone remembered where the switch was.'),
      L(44, 'KASIMIR', 'That\'s still illegal.'),
      L(50, 'ILSE',    'Arrest me.'),
      L(58, 'ILSE',    'I read it every year. I never knew what to say.'),
      L(65, 'KASIMIR', 'You didn\'t have to say anything. You just had to not burn it.')
    ],
    cards: [
      {t:10,  d:5, text:'OBSERVATION DECK · NORTH CAP', style:'location'},
      {t:110, d:6, text:'終', style:'end'}
    ]
  }));
})();
