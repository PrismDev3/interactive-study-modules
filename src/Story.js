/**
 * Story.js — mission director: cutscenes → fight → reward, through the story chapters,
 * then an endless Gauntlet that loops with rising difficulty.
 */
import * as THREE from 'three';
import { disposeRigRoot } from './GlbMinifig.js?v=147';
import { LegoSpidey } from './LegoSpidey.js?v=183';
import { progress } from './Progress.js?v=60';
import { Gauntlet } from './Gauntlet.js?v=3';
import { storySkills } from './StorySkills.js?v=4';

const SPIDEY = ['Spider-Man', 'spiderman'];
const STAN = ['Stan Lee', 'stanlee'];

// Speakers: [name, face]. Faces are decoded character heads, or "init:XY:rrggbb" initials portraits.
const PETER = ['Peter', 'glb:peterparker'], BEN = ['Uncle Ben', 'uncleben'], MAY = ['Aunt May', 'glb:auntmay'];
const GWEN = ['Gwen', 'glb:gwenstacy'], TOOMES = ['Adrian Toomes', 'glb:vulture'], VULTURE = ['The Vulture', 'glb:vulture'];
const NORMAN = ['Norman Osborn', 'init:NO:2a6a2a'], GOBLIN = ['Green Goblin', 'greengoblin'], HARRY = ['Harry', 'init:HO:8a6a3a'];
const MJ = ['Mary Jane', 'glb:maryjanewatson'], OTTO = ['Otto', 'glb:doctoroctopus'], DOCOCK = ['Doctor Octopus', 'glb:doctoroctopus'];
const CONNORS = ['Dr. Connors', 'glb:curtconnors'], LIZARD = ['The Lizard', 'glb:lizard'], SANDMAN = ['Sandman', 'sandman'];
const VENOM = ['Venom', 'venom'], BECK = ['Quentin Beck', 'glb:mysterio'], MYSTERIO = ['Mysterio', 'glb:mysterio'];
const JJ = ['J. Jonah Jameson', 'glb:jameson'];
// Calls: [[speaker, line], ...] on a mission. `call` rings on the way there, `after` once it's done.
// Named speakers without a dedicated model use a real minifig of the same world.
const CAST_ALBUM = {
  normanosborn: 'citycivilian_m03', harryosborn: 'citycivilian_m05', harry: 'citycivilian_m05',
  curtconnors: 'curtconnors',
};

const THUGS = (n, gun = 0) => [Array.from({ length: n }, (_, i) => (i < gun ? 'thugGun' : 'thug'))];
const actorKey = who => {
  const face = String(who?.[1] ?? '');
  return face.startsWith('glb:') ? face.slice(4)
    : face.startsWith('init:') ? String(who?.[0] ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
      : face;
};

let benFace = null;
function uncleBenFace() {
  if (benFace) return benFace;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#f7d117'; g.fillRect(0, 0, 128, 128);
  // A gentle, silver side part and mustache make Ben recognizable even without a ripped model.
  g.fillStyle = '#c6c2b8';
  g.beginPath(); g.ellipse(64, 44, 48, 23, 0, Math.PI, Math.PI * 2); g.fill();
  g.fillRect(18, 42, 14, 28); g.fillRect(96, 42, 14, 28);
  g.fillStyle = '#8f8a82'; g.fillRect(42, 79, 12, 3); g.fillRect(75, 79, 12, 3);
  g.fillStyle = '#1b1b1b';
  for (const x of [44, 84]) { g.beginPath(); g.ellipse(x, 90, 4, 6, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#8d8174';
  g.beginPath(); g.moveTo(50, 99); g.quadraticCurveTo(64, 91, 78, 99); g.quadraticCurveTo(72, 108, 64, 104); g.quadraticCurveTo(56, 108, 50, 99); g.fill();
  g.strokeStyle = '#533b31'; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(56, 112); g.quadraticCurveTo(64, 116, 72, 112); g.stroke();
  benFace = new THREE.CanvasTexture(canvas);
  benFace.colorSpace = THREE.SRGBColorSpace;
  benFace.magFilter = THREE.NearestFilter;
  return benFace;
}

/**
 * The campaign: six chapters, each a run of missions. A mission is: travel to the marker,
 * an optional cutscene, optional enemy waves and/or a boss, then an optional outro.
 * Chapter-level name/face/objective feed the chapter-select card.
 */
export const CHAPTERS = [
  {
    title: 'Chapter 1', name: 'The Beginning', face: 'spiderman', objective: 'A bite, a lesson, and the Vulture.',
    missions: [
      { name: 'The Bite', noWebs: true, noPowers: true, place: 'oscorpLab', suit: 'peter', objective: 'Get to the Oscorp field trip',
        cast: [{ key: 'gwenstacy', anchor: 'tankA' }, { key: 'goon_scientist', anchor: 'tankB' }],
        intro: [
          { stan: true, who: STAN, text: "A science trip to Oscorp, eh? Watch out for the spiders, kid." },
          { who: GWEN, text: "Peter! You made it. They're showing the cross-species spiders today.", gesture: 'talk' },
          { who: ['Oscorp Scientist', 'glb:goon_scientist'], text: "Please keep your hands away from the enclosure. These specimens are... unique.", gesture: 'point' },
          { who: PETER, text: "Is that one supposed to be outside the tank?" },
          { who: PETER, text: "OW! It bit me. Something just bit me." },
          { who: GWEN, text: "Peter, you're white as a sheet. Let's get you home." } ] },
      { name: 'Feeling Strange', call: [[MAY, "Peter? Gwen called. She said you nearly fainted on the field trip."], [PETER, "I'm okay, Aunt May. Just a bug bite."], [MAY, "Your uncle's making his terrible meatloaf. Come home, I'll protect you."]], noWebs: true, place: 'home', suit: 'peter', objective: 'Get home to Aunt May',
        cast: [{ key: 'auntmay', at: [1.4, 2.6] }],
        intro: [
          { who: MAY, text: "There you are! You look feverish, sweetheart. Straight to bed." },
          { who: PETER, text: "I'm fine, Aunt May. Better than fine. Everything's... louder." } ] },
      { name: 'Something Different', place: 'park', noWebs: true, suit: 'peter', objective: 'Deal with the bullies', waves: [['thug', 'thug'], ['thug', 'thug', 'thug']], intro: [
        { who: PETER, text: "I woke up stuck to the ceiling. And my glasses don't work, because I don't NEED them." },
        { who: PETER, text: "Okay. These guys picking on kids? Let's see what else changed." } ] },
      { name: 'Learning the Ropes', call: [[BEN, "Pete, you left before breakfast again. Everything alright?"], [PETER, "Yeah. Just... figuring some stuff out, Uncle Ben."], [BEN, "Figure it out at dinner. Seven o'clock. I mean it."]], place: 'park', suit: 'peter', objective: 'Swing to the rooftop marker', intro: [
        { who: PETER, text: "Wrists. Web. Building. How hard can it be?" },
        { who: PETER, text: "Very. It can be very hard. Okay, one more try." } ] },
      { name: 'A New Responsibility', place: 'home', suit: 'peter', objective: 'Stop the robbers', waves: [['thug', 'thugGun'], ['thug', 'thug', 'thugGun']],
        cast: [{ key: 'uncleben', at: [-1.9, 2.8] }], intro: [
          { who: BEN, text: "You've changed lately, Pete. Stronger. Faster. You look at everyone like they're asking you for something." },
          { who: PETER, text: "Maybe they are. Maybe I can't fix everything." },
          { who: BEN, text: "You don't have to fix everything. You do have to decide who you are when someone needs help." },
          { who: PETER, text: "What if I make the wrong choice?" },
          { who: BEN, text: "Then you own it, learn from it, and make the next one better." } ] },
      { name: 'The Wrestling Match', call: [[BEN, "Pete, I'll drop you off. Where are you going this late?"], [PETER, "Library. Big project, Uncle Ben."], [BEN, "Just remember what we talked about. Power means responsibility."]], place: 'theatre', suit: 'wrestler', cage: true, objective: 'Win the cage match', waves: [['thug', 'thug'], ['thug', 'thug', 'thug'], ['thugGun', 'thug', 'thug']], intro: [
        { who: PETER, text: "Three minutes in the ring with a homemade mask. Prize money buys a better suit." },
        { who: PETER, text: "Nobody here knows who I am. Good. Let's keep it that way." } ],
        outro: [
          { who: PETER, text: "Three minutes, you said. I won. Where's my money?" },
          { who: PETER, text: "Hey! That guy just robbed the box office... and he's running right past me." },
          { who: PETER, text: "Not my problem. He stiffed me anyway. Let him go." } ] },
      { name: 'The Night Everything Changed', place: 'home', time: 'night', suit: 'peter', objective: 'Stay with Uncle Ben',
        cast: [{ key: 'uncleben', at: [-1.7, 2.8], emote: 'wounded' }, { key: 'auntmay', at: [1.9, 3.1], emote: 'grief' }], intro: [
          { who: MAY, text: "Peter... he's here. Come sit with us.", mood: 'somber', shot: 'wide', pause: 600 },
          { who: PETER, text: "Uncle Ben. I'm here. I'm right here.", pose: 'grief' },
          { who: BEN, text: "Hey, kid. Look at me. Don't look at the street. Look at me.", close: true, pause: 500 },
          { who: PETER, text: "When I was little and afraid to ride my bike, you ran beside me the whole block. You kept saying, 'I've got you.'" },
          { who: BEN, text: "And I did.", close: true, pause: 900 },
          { who: PETER, text: "I need you to say it again.", close: true, pause: 700 },
          { who: PETER, text: "I saw him run. I could have stopped him. I just let him go." },
          { who: BEN, text: "You made a choice you regret. Don't let it be the only choice you ever make.", close: true },
          { who: PETER, text: "I knew it was wrong. I knew, and I still walked away." },
          { who: BEN, text: "Then when someone needs you tomorrow... show up. That's how you carry this.", close: true, pause: 600 },
          { who: PETER, text: "Tell me what to do. Please. I'll do anything." },
          { who: BEN, text: "You already know, Pete. You always have.", gesture: 'reach', close: true, pause: 900 },
          { who: BEN, text: "I've got you, kid. I'm proud of you. I love you.", close: true, afterMove: 'collapse', pause: 1600 },
          { who: PETER, text: "Uncle Ben?", close: true, pose: 'grief', pause: 1400 },
          { who: PETER, text: "No. No, stay with me. Please, Uncle Ben. I can't do this without you.", pose: 'grief', pause: 1800 },
          { who: MAY, text: "Peter...", pose: 'grief', shot: 'wide', pause: 2200 },
          // A beat of LEGO silliness after the heaviest scene in the game: Ben goes to pieces, studs and all
          { who: MAY, text: "...", shatter: 'uncleben', shot: 'wide', pause: 1800 },
          { who: MAY, text: "He always did say he'd go out in pieces.", pose: 'grief' },
          { who: PETER, text: "...And he left us something, like always.", pause: 700 },
          { who: PETER, text: "I had the power to stop it. I did nothing. I won't let anyone else pay for my choice.", pose: 'grief', mood: null } ] },
      { name: 'The Vulture', place: 'docks', suit: 'homemade', objective: 'Ground the Vulture', boss: 'vulture', waves: THUGS(3, 1), intro: [
        { focus: 'boss', who: VULTURE, text: "Stolen tech, stolen wings, honest work. The city owes me, kid." },
        { who: PETER, text: "Pretty sure stealing isn't honest work, Mr. Toomes." } ],
        outro: [{ who: TOOMES, text: "You don't know what this city takes from people like me." }] },
      { name: 'Becoming Spider-Man', after: [[MAY, "I saw that spider fellow on the news tonight. Saving a bus full of kids."], [PETER, "Huh. Yeah. Crazy."], [MAY, "Your uncle would have liked him. He always said power should look after people."]], place: 'bugle', objective: 'Clean up the streets', waves: [['thug', 'thugGun', 'thug'], ['thugGun', 'thug', 'thug']],
        cast: [{ key: 'jameson', at: [1.6, 2.8] }],
        intro: [
          { who: JJ, text: "Spider-Man! Menace! Masked vigilante! Parker, get me pictures of him!" },
          { who: PETER, text: "Sure thing, Mr. Jameson. I've got a feeling I can get really close." } ],
        outro: [{ who: PETER, text: "New suit. New name. Spider-Man. Uncle Ben, this one's for you." }] },
    ],
  },
  {
    title: 'Chapter 2', name: 'The Price of Being a Hero', face: 'greengoblin', objective: 'Oscorp, the Goblin, and a terrible loss.',
    missions: [
      { name: 'Oscorp', call: [[GWEN, "Hey, Spider-photographer. You stood me up for coffee. Twice."], [PETER, "I know, I know. Things keep... falling out of the sky."], [GWEN, "Then show up today. Oscorp lobby. Ten minutes. Clock's ticking, Parker."]], place: 'oscorp', objective: 'Meet Gwen outside Oscorp', cast: [{ key: 'gwenstacy', at: [1.4, 2.6] }], intro: [
        { who: GWEN, text: "My internship at Oscorp starts today. Mr. Osborn wants to see the cross-species data." },
        { who: NORMAN, text: "Brilliant minds, Miss Stacy. Brilliant, and so very useful." } ] },
      { name: 'The Goblin', objective: 'Fight off the Goblin’s crew', waves: THUGS(4, 2), intro: [
        { focus: 'boss', who: GOBLIN, text: "Spider-Man! My little test subjects are dying to meet you." },
        { who: PETER, text: "That laugh is going to give me nightmares." } ] },
      { name: 'A City Under Threat', call: [[HARRY, "Pete, my dad didn't come home last night. Again."], [PETER, "Harry, I'm sure he's just working."], [HARRY, "He was laughing in his study at four in the morning. Alone. Who does that?"]], place: 'bank', objective: 'Protect the street', waves: [['thug', 'thugGun', 'thug'], ['thugGun', 'thugGun', 'thug', 'thug']], intro: [
        { who: GWEN, text: "Explosions all over Midtown. Peter, where are you?" },
        { who: PETER, text: "Right in the middle of it. Stay inside, Gwen." } ] },
      { name: 'The Investigation', place: 'jamesonVisitor', objective: 'Follow the lead to the Bugle', cast: [{ key: 'jameson', at: [1.6, 2.8], anchor: 'jamesonDesk' }], intro: [
        { who: JJ, text: "The Goblin's on every front page, Parker, and none of the pictures are yours!" },
        { who: PETER, text: "Glider parts. Oscorp serial numbers. Norman, what did you do?" },
        { who: HARRY, text: "Dad's been... strange. Talking to himself. Pete, I'm worried." } ] },
      { name: 'No Safe Place', call: [[GWEN, "Peter, I know about the mask. I've known for weeks."], [PETER, "Gwen, it's not safe for you to know that."], [GWEN, "It's not your job to decide what's safe for me. Let me help."]], objective: 'Hold them off', waves: THUGS(5, 2), intro: [
        { focus: 'boss', who: GOBLIN, text: "I know who you are, Peter. And I know who you love." } ] },
      { name: 'The Final Encounter', after: [[MAY, "Peter, sweetheart. You haven't eaten in two days."], [PETER, "I had one job, Aunt May. Catch her. That's all."], [MAY, "Grief is just love with nowhere to go. Come home and give some of it to me."]], objective: 'Defeat the Green Goblin', boss: 'goblin', cast: [{ key: 'gwenstacy', at: [-2.5, 4] }], intro: [
        { focus: 'boss', who: GOBLIN, text: "Choose, Spider-Man! Save the girl, or catch me!" },
        { who: GWEN, text: "Peter! I'm okay, just finish this!" } ],
        outro: [
          { who: PETER, text: "Gwen? Gwen, I caught you. I caught you... please." },
          { who: PETER, text: "I was too late. The one thing that mattered, and I was too late." } ] },
    ],
  },
  {
    title: 'Chapter 3', name: 'The Next Chapter', face: 'glb:doctoroctopus', objective: 'College, Doctor Octopus and the Lizard.',
    missions: [
      { name: 'College Life', call: [[HARRY, "Pete. Funeral's done. Dad's company is mine now, apparently."], [PETER, "I'm so sorry, Harry."], [HARRY, "Everyone's sorry. Nobody's honest. Say the name Spider-Man around me and see what happens."]], place: 'park', objective: 'Get to campus', intro: [
        { who: MAY, text: "First day of college. Gwen would be so proud of you, sweetheart." },
        { who: PETER, text: "I know, Aunt May. I'm trying to be someone she'd be proud of." } ] },
      { name: 'A New Beginning', place: 'theatre', objective: 'Meet Mary Jane at the cinema', cast: [{ key: 'maryjanewatson', at: [1.4, 2.6] }], intro: [
        { who: MJ, text: "So you're the photographer who always has the best Spider-Man shots. Lucky guy." },
        { who: PETER, text: "Lucky. Sure. Let's go with lucky." } ] },
      { name: 'The Missing Scientist', call: [[MJ, "So, photographer. You ran out on the movie at the good part."], [PETER, "Emergency. Family thing."], [MJ, "You have a lot of family emergencies, Tiger. One day you'll tell me the real one."]], place: 'oscorpLab', objective: 'Find Dr. Connors’ kidnappers', waves: THUGS(4, 2), intro: [
        { who: OTTO, text: "Curt Connors hasn't come to the lab in days. Something is wrong, Peter.", gesture: 'point' } ] },
      { name: 'Something in the Laboratory', place: 'oscorpLab', objective: 'Clear the lab', waves: [['thug', 'thug'], ['thugGun', 'thugGun', 'thug']], intro: [
        { who: CONNORS, text: "Get out of here, Peter. The serum... I can't hold it back much longer.", gesture: 'grief' } ] },
      { name: 'The Octavius Experiment', place: 'oscorpLab', objective: 'Stop Doctor Octopus at Oscorp', boss: 'docock', intro: [
        { focus: 'boss', who: DOCOCK, text: "The arms think with me now. They tell me to finish the work.", gesture: 'point' },
        { who: PETER, text: "Doc, you taught me science. Let me help you." } ],
        outro: [{ who: OTTO, text: "Peter... the inhibitor chip. Thank you.", gesture: 'grief' }] },
      { name: 'The Lizard', call: [[OTTO, "Peter, the arms are quiet now. I can think again. Thank you."], [PETER, "You did the hard part, Doc."], [OTTO, "Curt's notes are in my lab. He believed he could fix himself. Bring him back, if anyone can."]], place: 'park', objective: 'Bring down the Lizard', boss: 'lizard', intro: [
        { focus: 'boss', who: LIZARD, text: "No more weakness. No more humans. Only the strong." } ] },
      { name: 'A Dangerous Discovery', place: 'docks', objective: 'Check the crash site', intro: [
        { who: PETER, text: "A meteor in the park, and something black and alive crawling out of it." },
        { who: MJ, text: "Peter, don't touch it. Whatever it is, it's looking at you." } ] },
    ],
  },
  {
    title: 'Chapter 4', name: 'Darkness Within', face: 'venom', objective: 'The symbiote, Sandman, and Venom.',
    missions: [
      { name: 'Something Has Arrived', place: 'park', objective: 'Investigate the noises', intro: [
        { who: PETER, text: "I woke up in a black suit. I feel... incredible. Stronger than ever." } ] },
      { name: 'The New Suit', suit: 'symbiote', objective: 'Try out the new suit', waves: THUGS(5, 1), intro: [
        { who: PETER, text: "Let's see what this thing can really do." } ] },
      { name: 'Unstable', call: [[MAY, "You raised your voice at me this morning, Peter. You've never done that."], [PETER, "I've been under a lot of pressure. It won't happen again."], [MAY, "Whatever's on you, it isn't you. Take it off."]], suit: 'symbiote', objective: 'Stop the riot', waves: [['thug', 'thug', 'thugGun'], ['thugGun', 'thug', 'thug', 'thug']], intro: [
        { who: MJ, text: "You scared me tonight, Peter. That wasn't you." },
        { who: PETER, text: "Maybe it's the me I should've been all along." } ] },
      { name: 'Sandman', call: [[JJ, "Parker! The new black-suit Spider-Man nearly flattened a cop! I love it! Get me more!"], [PETER, "That wasn't... he didn't mean to."], [JJ, "Meaning's for poets! Pictures, Parker! Pictures!"]], place: 'docks', suit: 'symbiote', objective: 'Beat Sandman', boss: 'sandman', intro: [
        { focus: 'boss', who: SANDMAN, text: "I'm not a bad man. I just keep ending up in bad places." } ] },
      { name: 'The Lizard Returns', place: 'park', suit: 'symbiote', objective: 'Stop the Lizard again', boss: 'lizard', hpScale: 1.3, intro: [
        { focus: 'boss', who: LIZARD, text: "Connors is gone. There is only me." } ] },
      { name: 'The Other Side', call: [[MJ, "I'm only calling once. The man at the club last night wasn't the Peter I know."], [PETER, "MJ, I'm getting rid of it. Tonight."], [MJ, "Then call me tomorrow. The real you. I'll pick up."]], suit: 'symbiote', objective: 'Get the suit off', waves: THUGS(6, 2), intro: [
        { who: PETER, text: "The bell tower. The noise hurts it. Time to get this thing off me." } ] },
      { name: 'Venom', place: 'docks', objective: 'Defeat Venom', boss: 'venom', intro: [
        { focus: 'boss', who: VENOM, text: "You threw us away, Parker. We found someone who appreciates us." } ] },
      { name: 'Breaking Free', after: [[PETER, "MJ? It's me. The real me."], [MJ, "...Took you long enough, Tiger."], [PETER, "I'm done hiding things from you. All of it. Starting now."]], objective: 'Get clear', intro: [
        { who: PETER, text: "I'm free of it. But Venom got away. This isn't over." } ] },
    ],
  },
  {
    title: 'Chapter 5', name: 'Far From Home', face: 'glb:mysterio', objective: 'Mysterio’s illusions and a new Goblin.',
    missions: [
      { name: 'A Different Life', place: 'theatre', objective: 'Meet MJ at the cinema', cast: [{ key: 'maryjanewatson', at: [1.4, 2.6] }], intro: [
        { who: MJ, text: "A normal date. No webs. No sirens. Can you do that?" },
        { who: PETER, text: "Absolutely. Totally. Probably." } ] },
      { name: 'The Osborn Legacy', call: [[HARRY, "Come up to the penthouse, Pete. I found something in Dad's lab. Something with a mask."], [PETER, "Harry, don't touch anything. I'm on my way."]], place: 'oscorpLobby', objective: 'Check on Harry', waves: THUGS(3, 1), intro: [
        { who: HARRY, text: "My father's gone, and everyone says Spider-Man did it. Did you know him, Pete?" } ] },
      { name: 'The Illusion', objective: 'Face Mysterio', boss: 'mysterio', intro: [
        { who: BECK, text: "The city needs a new hero. One with better special effects." },
        { focus: 'boss', who: MYSTERIO, text: "What you see is what I decide you see." } ] },
      { name: 'Nothing Is Real', call: [[MJ, "Peter, every screen in Times Square is showing you fighting yourself. Are you okay?"], [PETER, "Honestly? I can't tell which of me is real right now."], [MJ, "The one who answered the phone. Follow my voice."]], place: 'bank', objective: 'Break through the illusions', waves: [['thug', 'thug', 'thug'], ['thugGun', 'thugGun', 'thug', 'thug']], intro: [
        { who: PETER, text: "The streets are folding. Which of these guys are actually real?" } ] },
      { name: 'The Goblin Returns', objective: 'Stop the new Goblin', boss: 'harrygoblin', intro: [
        { focus: 'boss', who: HARRY, text: "Dad's glider. Dad's mask. Now I finish what he started." },
        { who: PETER, text: "Harry, he lied to you. Please don't become him." } ] },
      { name: 'The Final Illusion', call: [[BECK, "Spider-Man. Big night tonight. Live broadcast. You're the headliner."], [PETER, "Beck, nobody has to get hurt."], [BECK, "Oh, nobody gets hurt. You just get seen."]], place: 'bugle', objective: 'Defeat Mysterio at the Bugle', boss: 'mysterio', hpScale: 1.5, intro: [
        { focus: 'boss', who: MYSTERIO, text: "One last trick, Spider-Man. Let's show the world your face." } ],
        outro: [{ who: PETER, text: "Every screen in New York... has my name on it. Everyone knows." }] },
    ],
  },
  {
    title: 'Chapter 6', name: 'No Way Back', face: 'glb:electro', objective: 'The Sinister Six, at the Statue of Liberty.',
    missions: [
      { name: 'The World Knows', place: 'home', objective: 'Get through the crowd', waves: THUGS(4, 1), intro: [
        { who: MAY, text: "Reporters on the lawn, Peter. Whatever happens, this is still your home." } ] },
      { name: 'No Safe Place', call: [[MAY, "Peter, I knew. I've known since the night you came home with your uncle's blood on your shirt."], [PETER, "You never said anything."], [MAY, "I was waiting for you to be ready. Now go. I'm stronger than they think."]], objective: 'Protect Aunt May', waves: [['thug', 'thugGun', 'thug'], ['thug', 'thug', 'thugGun', 'thugGun']], intro: [
        { who: PETER, text: "They know where I live. They know everyone I love." } ] },
      { name: 'Old Enemies', place: 'bank', objective: 'Face the past', waves: [['vulture'], ['lizard']], hpScale: 1.2, intro: [
        { who: VULTURE, text: "The whole gang's back together, kid. Somebody broke us all out." } ] },
      { name: 'The Six', place: 'docks', objective: 'Defeat the Sinister Six', waves: [['docock'], ['sandman', 'mysterio']], hpScale: 1.3, intro: [
        { who: DOCOCK, text: "Six of us, Peter. One of you. The arithmetic is simple." } ] },
      { name: 'An Unlikely Alliance', call: [[JJ, "Parker. Or Spider-Man. Whatever. The Bugle's running your side of the story tomorrow."], [PETER, "You hate me."], [JJ, "I hate menaces! You keep showing up for this city. Don't make me say it twice."]], place: 'park', objective: 'Meet your allies', allies: ['goblin', 'venom'], intro: [
        { who: HARRY, text: "I'm done being my father. Let me fly with you this time." },
        { who: VENOM, text: "We don't like you, Parker. We like them even less." },
        { who: PETER, text: "I used to think doing this alone was the responsibility. It isn't." },
        { who: PETER, text: "Harry. Venom. Okay. Let's end this. Together." } ] },
      { name: 'The Statue of Liberty', call: [[MJ, "Whatever happens out there, come back."], [PETER, "Last time I promised that, I couldn't keep it."], [MJ, "Then don't promise. Just come back."]], place: 'liberty', allies: ['goblin', 'venom'], objective: 'Get to Liberty Island', waves: THUGS(6, 3), intro: [
        { who: PETER, text: "They're gathering at the Statue of Liberty. Everyone's watching." } ] },
      { name: 'One Last Fight', after: [[MAY, "Spaghetti tonight. Bring Harry. Bring Mary Jane."], [PETER, "And the big guy in black?"], [MAY, "Venom can wait outside. I'm not cleaning that off the couch."]], place: 'liberty', allies: ['goblin', 'venom'], objective: 'Defeat the Green Goblin', boss: 'goblin', hpScale: 2, waves: [['thug', 'thugGun']], intro: [
        { focus: 'boss', who: GOBLIN, text: "The whole world knows your name now, Peter. Let's give them a show!" },
        { who: PETER, text: "I couldn't catch Gwen. I've carried that every day since." },
        { who: PETER, text: "This time, nobody falls." } ],
        outro: [
          { who: HARRY, text: "It's over, Pete. It's really over." },
          { who: PETER, text: "Not over. Just... my life now. And I wouldn't trade it." },
          { stan: true, who: STAN, text: "Spectacular! Now go swing around the city, True Believer. Free Play is all yours." } ] },
    ],
  },
];


export class Story {
  constructor({ scene, sceneSetup, controller, combat, hud, ui, camera, life }) {
    Object.assign(this, { scene, sceneSetup, controller, combat, hud, ui, camera, life });
    this.markerPos = null;
    this._buildMarker();
    this.chapter = 0;
    this.round = 0;
    this.busy = false;
  }

  start() { this._run(); }

  async _run() {
    while (true) {
      if (this.chapter < CHAPTERS.length) {
        const ch = CHAPTERS[this.chapter];
        // Resume at the mission you reached in this chapter instead of restarting it
        let saved = null; try { saved = JSON.parse(localStorage.getItem('storyPos') || 'null'); } catch (e) {}
        const from = saved && saved.chapter === this.chapter && this.saveProgress !== false ? Math.min(saved.mission, ch.missions.length - 1) : 0;
        for (this.mission = from; this.mission < ch.missions.length; this.mission++) {
          try { localStorage.setItem('storyPos', JSON.stringify({ chapter: this.chapter, mission: this.mission })); } catch (e) {}
          const m = ch.missions[this.mission];
          await this._playChapter({ ...m, title: `${ch.title}: ${m.name}`, cardTop: `${ch.title} · ${ch.name}` });
        }
        await this._applySuit(null);
        this._dismissAllies();
        let earnedPoint = false;
        if (this.saveProgress) {
          const before = progress.chaptersDone;
          progress.completeChapter(this.chapter);
          earnedPoint = progress.chaptersDone > before;
        }
        try { localStorage.removeItem('storyPos'); } catch (e) {}
        this.hud.toast(earnedPoint ? `${ch.name.toUpperCase()} COMPLETE · SKILL POINT EARNED` : `${ch.name.toUpperCase()} COMPLETE`);
        await this._wait(3);
      } else {
        await this._playChapter(this._gauntletRound());
      }
      this.chapter++;
    }
  }

  _gauntletRound() {
    this.gauntlet ??= new Gauntlet({ combat: this.combat, hud: this.hud, ui: this.ui });
    const r = this.gauntlet.nextRound();
    this.round = this.gauntlet.round;
    return r;
  }

  /** In-world mission marker: a gold light beam with a spinning "!" token. */
  _buildMarker() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 90, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.y = 45;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.25, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.15;
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const x = c.getContext('2d');
    x.fillStyle = '#111'; x.fillRect(2, 2, 12, 12);
    x.fillStyle = '#ffd23f'; x.fillRect(3, 3, 10, 10);
    x.fillStyle = '#111'; x.fillRect(7, 5, 2, 5); x.fillRect(7, 11, 2, 1);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    this._token = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    this._token.position.y = 4;
    g.add(beam, ring, this._token);
    g.visible = false;
    this.scene.add(g);
    this._marker = g;
  }

  /** Place the marker on a street some distance away and wait for the player to reach it. */
  async _goToMarker(minR, maxR, fixed = null) {
    const kinds = new Set(['asphalt', 'paint', 'sidewalk', 'path']);
    const spot = fixed ? fixed.clone() : this.life?._findSpot(kinds, minR, maxR) ?? this.controller.root.position.clone();
    this.markerPos = spot;
    this._marker.position.copy(spot);
    this._marker.visible = true;
    this.ui.setObjective('Go to the marker');
    await new Promise(resolve => {
      const tick = () => {
        const p = this.controller.root.position;
        if (Math.hypot(p.x - spot.x, p.z - spot.z) < 6 && Math.abs(p.y - 0.5 - spot.y) < 6) resolve();
        else setTimeout(tick, 150);
      };
      tick();
    });
    this._marker.visible = false;
    this.markerPos = null;
  }

  /** Per-frame: keep the screen marker pinned to the mission spot. */
  update(dt) {
    if (this._marker.visible) this._token.rotation.y += dt * 2.5;
    if (this._nightLight?.visible) {
      const p = this.controller.root.position;
      this._nightLight.position.set(p.x - 2, p.y + 6, p.z + 2);
    }
    this.gauntlet?.update(dt);
    this.ui.updateMarker(this.markerPos, this.camera, this.controller.root.position);
  }

  async _playChapter(ch) {
    this.ui.setObjective(null);
    if (this.ui.missionCard && ch.cardTop) this.ui.missionCard(ch.cardTop, ch.name); else this.hud.toast(ch.title);
    const time = ch.time ?? 'day';
    if (time !== this._storyTime) {
      await this.ui.fade?.(true, 250);
      this.sceneSetup?.setTime?.(time);
      this._storyTime = time;
      if (time === 'night') {
        this._nightLight ??= new THREE.PointLight(0xffc78f, 1.8, 34, 2);
        this._nightLight.visible = true;
        this.scene.add(this._nightLight);
      } else if (this._nightLight) this._nightLight.visible = false;
      await this.ui.fade?.(false, 650);
    }
    await this._applySuit(ch.suit);
    this.controller.noWebs = !!ch.noWebs;
    this.controller.noPowers = !!ch.noPowers;   // before the bite: no wall climbing, flips or super jumps   // Peter hasn't built his web-shooters yet
    await this._wait(2);
    // Pacing: a phone call on the way keeps the story moving during the travel leg
    if (ch.call) setTimeout(() => this.ui.call?.(ch.call), 2500);
    const P = this.landmarks?.places ?? {};
    // Interior marks (Bugle newsroom, Jameson's office) fall back to the Bugle's street spot
    const place = ch.place && (P[ch.place] ?? (/^(bugle|jameson)/.test(ch.place) ? P.bugle : null));
    if (place) await this._goToMarker(0, 0, place);
    else if (ch.gauntlet && this.round > 1) await this._goToMarker(25, 55);
    else if (this.chapter === 0 && !this.mission) await this._goToMarker(25, 60);
    else await this._goToMarker(60, 120);
    if (ch.cage) this._buildCage(this.controller.root.position.clone());
    const cast = ch.cast ? await this._spawnCast(ch.cast) : [];
    if (ch.allies) await this._summonAllies(ch.allies);

    let boss = null;
    if (ch.boss) boss = await this.combat.spawn(ch.boss, this.combat.spotNear(this.controller.root.position, 9, 13), ch.hpScale ?? 1);
    if (ch.boss2) await this.combat.spawn(ch.boss2, this.combat.spotNear(this.controller.root.position, 10, 15), ch.hpScale ?? 1);
    if (ch.intro) await this._cutscene(ch.intro, boss, cast);
    if (ch.gauntlet) { this.gauntlet.beginRound(); this.hud.toast('FIGHT!'); }

    const waves = ch.waves ? [...ch.waves] : [];
    const total = waves.flat().length + (boss ? 1 : 0);
    this.ui.setObjective(`${ch.objective}`);
    if (waves.length || boss) this.combat.sfx?.play('mission');
    for (const wave of waves) {
      await this._spawnWave(wave, ch.hpScale ?? 1);
      await this._until(() => this.combat.enemies.filter(e => e.alive && !e.T.boss).length <= 1, ch, total);
    }
    await this._until(() => this.combat.aliveCount === 0, ch, total);

    this.ui.setObjective(null);
    const res = ch.gauntlet ? this.gauntlet.endRound() : null;
    this.hud.toast(ch.gauntlet ? `Round ${this.round} cleared!` : 'Mission complete!');
    this.combat.sfx?.play(ch.gauntlet ? 'objective' : 'complete');
    window.gameMusic?.resolve();
    const missionStuds = ch.gauntlet ? Math.min(res.bonus, 20000) : Math.round(5000 * (storySkills.active('streetwise') ? 1.25 : 1));
    this.hud.burstStuds(this.controller.root.position.clone(), missionStuds,
      this.controller.root.position.y - 0.5);
    if (storySkills.active('secondwind') && this.combat.hearts < this.combat.maxHearts) {
      this.combat.hearts = Math.min(this.combat.maxHearts, this.combat.hearts + 1);
      this.ui.setHearts(this.combat.hearts, this.combat.maxHearts);
    }
    await this._wait(ch.gauntlet ? 1.5 : 2.5);
    if (ch.gauntlet) { this.combat.clearEnemies(); await this.gauntlet.intermission(res); }
    if (ch.outro) await this._cutscene(ch.outro, null, cast);
    this._dismissCast(cast);
    this.combat.clearEnemies();
    if (ch.after) this.ui.call?.(ch.after);   // the aftermath lands on the swing to the next job
    this._removeCage();
  }

  async _spawnWave(kinds, hpScale) {
    // Variety: as the story goes on, some thugs are swapped for specialists
    const ch = this.chapter ?? 0, odds = Math.min(0.5, 0.12 + ch * 0.08);
    const MELEE = ch < 1 ? ['brute'] : ['brute', 'symbiote'], GUNS = ch < 1 ? ['thugGun'] : ['pyro', 'cryo', 'sparky', 'doombot'];
    kinds = kinds.map(k => k === 'thug' && Math.random() < odds ? MELEE[Math.floor(Math.random() * MELEE.length)]
      : k === 'thugGun' && Math.random() < odds ? GUNS[Math.floor(Math.random() * GUNS.length)] : k);
    const p = this._cage?.center ?? this.controller.root.position;
    const [a, b] = this._cage ? [2, 5] : [8, 18];                 // in a cage match everyone spawns inside the ring
    await Promise.all(kinds.map(k => this.combat.spawn(k, this.combat.spotNear(p, a, b), hpScale)));
  }

  /** Wrestling cage: a raised blue mat ring with turnbuckle posts, ropes and a chain-link cage you can't leave. */
  /** Nearest flat, open patch around `c` big enough for the ring (no walls within reach of it). */
  _cageSpot(c, S) {
    const L = this.landmarks, meshes = L?.meshes ?? [];
    if (!L?._drop) return c;
    const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3());
    for (let r = 0; r <= 45; r += 3) {
      for (let k = 0; k < (r ? 16 : 1); k++) {
        const a = k / 16 * Math.PI * 2, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        const h = L._drop(x, z);
        if (!h || Math.abs(h.point.y - c.y) > 2) continue;
        let flat = true;
        for (const [dx, dz] of [[S, S], [-S, S], [S, -S], [-S, -S]]) {
          const q = L._drop(x + dx, z + dz);
          if (!q || Math.abs(q.point.y - h.point.y) > 0.5) { flat = false; break; }
        }
        if (!flat) continue;
        let open = true;
        for (let j = 0; j < 16 && open; j++) {
          const b = j / 16 * Math.PI * 2;
          ray.origin.set(x, h.point.y + 1.2, z); ray.direction.set(Math.cos(b), 0, Math.sin(b));
          if (meshes.some(m => m.geometry?.boundsTree?.raycastFirst(ray, THREE.DoubleSide, 0, S * 1.45 + 1))) open = false;
        }
        if (open) return h.point.clone();
      }
    }
    return c;
  }

  _buildCage(c) {
    this._removeCage();
    const g = new THREE.Group(), S = 7, H = 4.5, RISE = 0.7;     // half-size, wall height, ring height
    const A = 17, AH = 13;                                        // arena hall half-size and height
    // Built well above the street so no city building can poke through the hall
    c = new THREE.Vector3(c.x, c.y + 240, c.z);
    const mat = (col, r = 0.5) => new THREE.MeshStandardMaterial({ color: col, roughness: r });
    // A real raised ring: blue canvas on a black skirted base
    const floor = new THREE.Mesh(new THREE.BoxGeometry(S * 2, 0.1, S * 2), mat(0x1d4fa8, 0.7));
    floor.position.y = 0.05; g.add(floor);
    const apron = new THREE.Mesh(new THREE.BoxGeometry(S * 2 + 0.6, RISE, S * 2 + 0.6), mat(0x16171a));
    apron.position.y = -RISE / 2 + 0.01; g.add(apron);
    for (let k = 0; k < 3; k++) {                                        // steps up on the near side
      const st = new THREE.Mesh(new THREE.BoxGeometry(2.4, RISE * (k + 1) / 3, 0.5), mat(0x2a2a30));
      st.position.set(0, -RISE + RISE * (k + 1) / 6, -S - 0.55 - (2 - k) * 0.5); g.add(st);
    }
    const logo = document.createElement('canvas'); logo.width = 512; logo.height = 128;
    const x = logo.getContext('2d'); x.font = 'bold 84px "Lilita One", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 12; x.strokeStyle = '#141414'; x.strokeText('CAGE MATCH', 256, 64); x.fillStyle = '#ffd200'; x.fillText('CAGE MATCH', 256, 64);
    const lt = new THREE.CanvasTexture(logo); lt.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: lt, transparent: true }));
    sign.rotation.x = -Math.PI / 2; sign.position.y = 0.11; sign.scale.setScalar(1.3); g.add(sign);
    // Chain-link texture for the cage walls
    const cl = document.createElement('canvas'); cl.width = cl.height = 64;
    const y = cl.getContext('2d'); y.strokeStyle = '#c8ccd2'; y.lineWidth = 3;
    y.beginPath(); y.moveTo(0, 32); y.lineTo(32, 0); y.lineTo(64, 32); y.lineTo(32, 64); y.closePath(); y.stroke();
    const ct = new THREE.CanvasTexture(cl); ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.repeat.set(S * 2 / 0.6, H / 0.6);
    const fence = new THREE.MeshStandardMaterial({ map: ct, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 });
    const steel = mat(0x8a9099, 0.35), red = mat(0xc8141a, 0.4), solids = [];
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2, wall = new THREE.Mesh(new THREE.PlaneGeometry(S * 2, H), fence);
      wall.position.set(Math.sin(a) * S, H / 2, Math.cos(a) * S); wall.rotation.y = a; g.add(wall);
      const top = new THREE.Mesh(new THREE.BoxGeometry(S * 2, 0.12, 0.12), steel);
      top.position.set(Math.sin(a) * S, H, Math.cos(a) * S); top.rotation.y = a; g.add(top);
      for (const ry of [0.7, 1.2, 1.7]) {                                       // red ropes inside the cage
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, S * 2 - 0.4, 6), red);
        rope.rotation.z = Math.PI / 2; rope.rotation.y = a;
        rope.position.set(Math.sin(a) * (S - 0.25), ry, Math.cos(a) * (S - 0.25)); g.add(rope);
      }
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, H + 0.3, 10), steel);
      post.position.set((k & 1 ? 1 : -1) * S, (H + 0.3) / 2, (k & 2 ? 1 : -1) * S); g.add(post);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.9, 0.34), red);
      pad.position.set((k & 1 ? 1 : -1) * (S - 0.2), 1.2, (k & 2 ? 1 : -1) * (S - 0.2)); g.add(pad);
      // Collision: a thick slab per side, tall enough that you can't just hop out
      const w = new THREE.BoxGeometry(S * 2 + 1, H + 6, 0.6).rotateY(a).translate(c.x + Math.sin(a) * (S + 0.3), c.y + RISE + (H + 6) / 2, c.z + Math.cos(a) * (S + 0.3));
      solids.push(w);
    }
    solids.push(new THREE.BoxGeometry(S * 2 + 0.6, RISE, S * 2 + 0.6).translate(c.x, c.y + RISE / 2, c.z));
    for (let k = 0; k < 3; k++) solids.push(new THREE.BoxGeometry(2.4, RISE * (k + 1) / 3, 0.5).translate(c.x, c.y + RISE * (k + 1) / 6, c.z - S - 0.55 - (2 - k) * 0.5));
    // Enclosed arena hall around the ring: the match happens indoors, not out on the street.
    {
      const hallMat = new THREE.MeshStandardMaterial({ color: 0x23202a, roughness: 0.85, side: THREE.DoubleSide });
      const floorY = -RISE;
      const hf = new THREE.Mesh(new THREE.BoxGeometry(A * 2, 0.2, A * 2), mat(0x3a2e26, 0.8));
      hf.position.y = floorY - 0.05; g.add(hf);
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2;
        const wl = new THREE.Mesh(new THREE.PlaneGeometry(A * 2, AH), hallMat);
        wl.position.set(Math.sin(a) * A, floorY + AH / 2, Math.cos(a) * A); wl.rotation.y = a; g.add(wl);
        // Three rows of bleachers with a seated-crowd colour band on every wall
        for (let r = 0; r < 3; r++) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(A * 2 - 2, 0.8, 1.6), mat([0x5a1418, 0x6e1a1e, 0x82211f][r], 0.7));
          const d = A - 1 - r * 1.6;
          b.position.set(Math.sin(a) * d, floorY + 0.4 + (2 - r) * 0.8, Math.cos(a) * d); b.rotation.y = a; g.add(b);
        }
        solids.push(new THREE.BoxGeometry(A * 2 + 1, AH, 0.8).rotateY(a).translate(c.x + Math.sin(a) * (A + 0.4), c.y + AH / 2, c.z + Math.cos(a) * (A + 0.4)));
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(A * 2 + 1, 0.4, A * 2 + 1), hallMat);
      roof.position.y = floorY + AH; g.add(roof);
      solids.push(new THREE.BoxGeometry(A * 2 + 1, 0.4, A * 2 + 1).translate(c.x, c.y + AH, c.z));
      // Hanging lighting rig over the ring
      const rig = new THREE.Mesh(new THREE.BoxGeometry(S * 2, 0.3, S * 2), mat(0x111114));
      rig.position.y = floorY + AH - 2.5; g.add(rig);
      // Lit by glowing lamp panels, not a new PointLight: adding a light mid-game recompiled every
      // material's shader (a ~6 s freeze on entering the arena) and cost per-pixel lighting.
      const glow = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff0cc, emissiveIntensity: 1.2 });
      for (const [lx, lz] of [[-S / 2, -S / 2], [S / 2, -S / 2], [-S / 2, S / 2], [S / 2, S / 2]]) {
        const lp = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 2.2), glow);
        lp.position.set(lx, floorY + AH - 2.7, lz); g.add(lp);
      }
    }
    g.position.set(c.x, c.y + RISE, c.z);
    g.traverse(n => { if (n.isMesh) n.receiveShadow = true; });
    this.controller.root.position.set(c.x, c.y + RISE + 0.6, c.z);
    this.controller.velocity?.set(0, 0, 0);
    c = c.clone().setY(c.y + RISE);
    this.scene.add(g);
    const cols = solids.map(geo => {
      // Both sides solid: from inside the ring you hit the back faces, which a one-sided collider ignores
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); m.visible = false;
      geo.computeBoundsTree?.(); this.scene.add(m); this.landmarks?.meshes?.push(m); return m;
    });
    this._cage = { group: g, cols, center: c };
    // The hall is closed: stop drawing the city 240 m below and all around it
    if (this.sceneSetup) this.sceneSetup.farCap = A * 2 + 25;
  }

  _removeCage() {
    const k = this._cage;
    if (!k) return;
    this.scene.remove(k.group);
    if (this.sceneSetup) this.sceneSetup.farCap = null;
    for (const m of k.cols) {
      this.scene.remove(m);
      const arr = this.landmarks?.meshes, i = arr?.indexOf(m);
      if (i >= 0) arr.splice(i, 1);
    }
    this._cage = null;
  }

  _until(cond, ch, total) {
    // Allies fighting beside you chip in now and then
    const BARKS = {
      goblin: [[HARRY, "On your left, Pete! Pumpkin coming in hot!"], [HARRY, "Dad built this glider for this. I'm using it right."],
               [HARRY, "Keep them busy, I've got the flyers!"], [HARRY, "Just like old times, huh? Except the exploding part."]],
      venom: [[VENOM, "We'll take the big ones. You take the... small ones."], [VENOM, "Snacks. So many snacks."],
              [VENOM, "Don't get used to this, Parker."], [VENOM, "We are having FUN."]],
    };
    let barkT = 6;
    const bark = () => {
      const keys = [...(this._allies?.keys() ?? [])].filter(k => BARKS[k]);
      if (!keys.length) return;
      const list = BARKS[keys[Math.floor(Math.random() * keys.length)]];
      const [who, text] = list[Math.floor(Math.random() * list.length)];
      this.ui.bark?.(who[0], who[1], text);
    };
    return new Promise(resolve => {
      const tick = () => {
        if ((barkT -= 0.2) <= 0) { barkT = 11 + Math.random() * 6; bark(); }
        const alive = this.combat.aliveCount;
        const done = this.combat.enemies.filter(e => !e.alive).length;
        this.ui.setObjective(`${ch.objective} ${done}/${Math.max(total, done + alive)}`);
        if (cond()) resolve(); else setTimeout(tick, 200);
      };
      tick();
    });
  }

  _wait(s) { return new Promise(r => setTimeout(r, s * 1000)); }

  async _cutscene(lines, boss, cast = []) {
    const c = this.controller;
    // Let a call on the way in finish before the scene starts (capped so nobody waits forever)
    for (let k = 0; k < 40 && this.ui._onCall; k++) await this._wait(0.3);
    const wasLocked = c.inputLocked, wasFrozen = this.combat.frozen;
    this.ui.skipAll = false;
    this.combat.frozen = true;
    c.inputLocked = true;
    if (c.webPhysics?.isSwinging) c.webPhysics.releaseWeb(false);
    c.isClimbing = false;
    c.velocity?.set(0, 0, 0);
    const groundY = c._getGroundY?.(c.root.position, c.root.position.y + 1);
    if (Number.isFinite(groundY) && Math.abs(c.root.position.y - (groundY + 0.5)) < 6) {
      c.root.position.y = groundY + 0.5;
      c.isGrounded = true;
    }
    c.emote = null;
    this.ui.cinematic(true);
    let stan = null;
    const hidden = [];
    try {
      // 1. Block the scene: everyone on a clear mark, on the actual floor, facing the group.
      await this._stageSpeakers(lines, boss, cast);
      // Pedestrians who wandered into the room would stand in the lens: clear them out for the scene.
      for (const n of this.life?.npcs ?? []) {
        if (!n?.active || !n.root) continue;
        if (n.root.position.distanceTo(c.root.position) < 14) { n.root.visible = false; hidden.push(n.root); }
      }
      // 2. Establishing shot of the real location, held just long enough to read the space.
      const pts = [c.root.position.clone(), ...cast.map(a => a.root.position.clone())];
      if (boss) pts.push(boss.root.position.clone());        const avoid = [c.root.position, ...cast.map(a => a.root.position)];
        if (boss) avoid.push(boss.root.position);
        const est = this._establishMark(pts, avoid);
      c.cinematic = { target: c.root, cam: est.cam, look: est.look, fov: est.fov, cut: true };
      await this._wait(1.15);

      // 3. Dialogue, cut by cut.
      let shotNo = 0;
      for (const line of lines) {
        if (line.stan && !stan) { stan = await this._spawnStan(); if (stan) avoid.push(stan.root.position); }
        const speakerKey = actorKey(line.who);
        const actor = cast.find(a => a.key && a.key === speakerKey);
        for (const a of cast) a.talking = a === actor;
        if (line.pose) this._setStoryPose(speakerKey, line.pose, cast);
        if (line.gesture) {
          if (actor) actor.gesture = line.gesture;
          else c.emote = line.gesture;
        }
        const focusRoot = line.focus === 'boss' && boss ? boss.root
          : line.stan && stan ? stan.root
            : line.who === STAN && stan ? stan.root : actor ? actor.root : c.root;
        for (const a of cast) {
          if (a.root !== focusRoot) a.root.rotation.y = Math.atan2(focusRoot.position.x - a.root.position.x, focusRoot.position.z - a.root.position.z);
        }
        if (c.root !== focusRoot) c.root.rotation.y = Math.atan2(focusRoot.position.x - c.root.position.x, focusRoot.position.z - c.root.position.z);
        if (stan && stan.root !== focusRoot) stan.root.rotation.y = Math.atan2(focusRoot.position.x - stan.root.position.x, focusRoot.position.z - stan.root.position.z);
        const listener = focusRoot === c.root
          ? (cast[0]?.root.position ?? boss?.root.position ?? null)
          : c.root.position;
        const kind = line.shot ?? (line.close ? 'close'
          : line.focus === 'boss' ? 'wide'
            : line.who === STAN ? 'medium'
              : shotNo % 5 === 4 ? 'wide' : shotNo % 4 === 1 ? 'ots' : shotNo % 4 === 2 ? 'close' : 'medium');
        const scale = focusRoot === boss?.root ? (boss.scale ?? 1) : 1;
        const shot = this._shotMark(kind, focusRoot.position, listener, scale, avoid);
        c.cinematic = { target: focusRoot, cam: shot.cam, look: shot.look, fov: shot.fov, cut: true };
        shotNo++;
        if ('mood' in line) document.body.classList.toggle('story-somber', line.mood === 'somber');
        if (line.shatter) this._shatterActor(cast.find(a => a.key === line.shatter));
        await this.ui.say(line.who[0], line.who[1], line.text);
        if (actor?.gesture) actor.gesture = null;
        if (!actor && line.gesture) c.emote = null;
        if (line.afterMove && actor && !this.ui.skipAll) await this._animateStoryActor(actor, line.afterMove);
        if (line.pause) await this._wait(line.pause / 1000);
      }
    } finally {
      document.body.classList.remove('story-somber');
      this.ui.cinematic(false);
      c.cinematic = null;
      c.emote = null;
      c.inputLocked = wasLocked;
      this.combat.frozen = wasFrozen;
      for (const a of cast) { a.talking = false; a.emote = null; a.gesture = null; }
      for (const r of hidden) r.visible = true;
      if (stan) this._dismissStan(stan);
    }
  }

  /** Nearest walkable floor under a point, searched downward from chest height. */
  _floorBelow(x, z, fromY) {
    const meshes = this.landmarks?.meshes ?? [];
    if (!meshes.length) return null;
    const ray = this._shotRay ??= new THREE.Ray();
    ray.origin.set(x, fromY, z); ray.direction.set(0, -1, 0);
    let best = null;
    for (const m of meshes) {
      const h = m.geometry?.boundsTree?.raycastFirst(ray, THREE.DoubleSide, 0, 9);
      if (h && (!best || h.distance < best.distance)) best = h;
    }
    return best ? fromY - best.distance : null;
  }

  /** Distance to the first wall in a direction, or null. */
  _rayHit(from, dir, far) {
    const meshes = this.landmarks?.meshes ?? [];
    const ray = this._shotRay ??= new THREE.Ray();
    ray.origin.copy(from); ray.direction.copy(dir);
    let best = null;
    for (const m of meshes) {
      const h = m.geometry?.boundsTree?.raycastFirst(ray, THREE.DoubleSide, 0, far);
      if (h && (!best || h.distance < best.distance)) best = h;
    }
    return best ? best.distance : null;
  }

  /** A figure standing here would not be inside a wall, plinth, bench or machine. */
  _standClear(x, z, floor) {
    const meshes = this.landmarks?.meshes ?? [];
    if (!meshes.length) return true;
    const ray = this._shotRay ??= new THREE.Ray();
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      for (const h of [0.35, 1.05]) {
        ray.origin.set(x, floor + h, z);
        ray.direction.set(Math.cos(a), 0, Math.sin(a));
        for (const m of meshes) {
          if (m.geometry?.boundsTree?.raycastFirst(ray, THREE.DoubleSide, 0, 0.62)) return false;
        }
      }
    }
    return true;
  }

  /** Snap a wanted mark to the floor and slide it out of furniture if needed. */
  _standMark(want, playerPos, taken) {
    const base = playerPos.y - 0.5;
    const ground = this._floorBelow(want.x, want.z, playerPos.y + 1.8) ?? base;
    const fits = (x, z, g) => {
      if (!this._standClear(x, z, g)) return false;
      const dp = Math.hypot(x - playerPos.x, z - playerPos.z);
      if (dp < 1.05 || dp > 6.5) return false;
      for (const t of taken) if (Math.hypot(x - t.x, z - t.z) < 1.0) return false;
      return true;
    };
    if (fits(want.x, want.z, ground)) return new THREE.Vector3(want.x, ground, want.z);
    for (let r = 0.8; r <= 3.2; r += 0.55) {
      for (let k = 0; k < 14; k++) {
        const a = k / 14 * Math.PI * 2;
        const x = want.x + Math.cos(a) * r, z = want.z + Math.sin(a) * r;
        const g = this._floorBelow(x, z, playerPos.y + 1.8);
        if (g == null || Math.abs(g - ground) > 0.7) continue;
        if (fits(x, z, g)) return new THREE.Vector3(x, g, z);
      }
    }
    // Last resort: keep the authored mark but at least sit it on the real floor.
    return new THREE.Vector3(want.x, ground, want.z);
  }

  /** A wide shot that shows the assembled group and the room they are in. */
  _establishMark(points, avoid = []) {
    const c = this.controller.root.position;
    const center = new THREE.Vector3();
    for (const p of points) center.add(p);
    center.multiplyScalar(1 / Math.max(1, points.length));
    const back = new THREE.Vector3(c.x - center.x, 0, c.z - center.z);
    if (back.lengthSq() < 0.2) back.set(Math.sin(this.controller.root.rotation.y + Math.PI), 0, Math.cos(this.controller.root.rotation.y + Math.PI));
    back.normalize();
    const right = new THREE.Vector3(-back.z, 0, back.x);
    const floor = this._floorBelow(c.x, c.z, c.y + 1.8) ?? (c.y - 0.5);
    const cam = new THREE.Vector3(center.x + back.x * 6.4 + right.x * 2.6, floor + 3.15, center.z + back.z * 6.4 + right.z * 2.6);
    const look = new THREE.Vector3(center.x, floor + 1.35, center.z);
    // Several wide positions: square-on, mirrored, higher and from the side. The first
    // one that is not inside a wall or another actor wins, so the establishing shot reads.
    const cands = [
      cam,
      new THREE.Vector3(center.x + back.x * 6.4 - right.x * 2.6, floor + 3.15, center.z + back.z * 6.4 - right.z * 2.6),
      new THREE.Vector3(center.x + back.x * 8.2 + right.x * 3.2, floor + 3.9, center.z + back.z * 8.2 + right.z * 3.2),
      new THREE.Vector3(center.x + right.x * 7.2 + back.x * 2.4, floor + 3.2, center.z + right.z * 7.2 + back.z * 2.4),
      new THREE.Vector3(center.x + back.x * 4.2, floor + 2.6, center.z + back.z * 4.2),
    ];
    for (const p of cands) {
      const u = this._floorBelow(p.x, p.z, p.y + 2);
      if (u != null) p.y = Math.max(p.y, u + 1.5);
    }
    return { cam: this._pickCam(look, cands, avoid) ?? cam, look, fov: 62 };
  }

  /** True when nothing solid sits between the subject and a lens position. */
  _clearLine(look, cam) {
    const dir = cam.clone().sub(look);
    const d = dir.length();
    if (d < 0.3) return false;
    dir.multiplyScalar(1 / d);
    // A hit just behind the lens is fine; a hit in front of it means the camera is inside
    // a tank, a console or a wall, which is what fills the frame with plastic.
    const hit = this._rayHit(look, dir, d + 0.05);
    return hit == null || hit > d - 0.25;
  }

  /** First lens candidate that is clear of walls and far enough from the other actors. */
  _pickCam(look, cands, others) {
    for (const c of cands) {
      if (!this._clearLine(look, c)) continue;
      let blocked = false;
      for (const p of others) {
        if (Math.hypot(c.x - p.x, c.z - p.z) < 1.7 && Math.abs(c.y - (p.y + 1.5)) < 2.4) { blocked = true; break; }
      }
      if (!blocked) return c;
    }
    return null;
  }

  /**
   * Camera mark for a dialogue beat. Shots are relative to the two people in frame so the
   * audience sees the speaker's face, and every candidate is checked against the room and
   * the other actors, so the lens never ends up inside a head, a tank or a wall.
   */
  _shotMark(kind, subjectPos, listenerPos, scale = 1, avoid = []) {
    const S = subjectPos;
    const feet = S.y - 0.5;
    const floor = this._floorBelow(S.x, S.z, S.y + 1.8) ?? feet;
    const headY = floor + 1.58 * Math.min(1.35, scale);
    const look = new THREE.Vector3(S.x, headY, S.z);
    const toward = listenerPos ? new THREE.Vector3(listenerPos.x - S.x, 0, listenerPos.z - S.z) : new THREE.Vector3(0, 0, 1);
    if (toward.lengthSq() < 0.04) toward.set(0, 0, 1); else toward.normalize();
    const right = new THREE.Vector3(-toward.z, 0, toward.x);
    // Stay on the speaker's side of the listener, never through them.
    const gap = listenerPos ? Math.hypot(listenerPos.x - S.x, listenerPos.z - S.z) : 14;
    // Shoot across the pair, not down the line between them: a lens on that axis ends up
    // inside the listener's head whenever two people stand close, which is most scenes.
    const side = Math.max(1.5, Math.min(2.9, gap * 0.85));
    const at = (fwd, off, y) => new THREE.Vector3(
      S.x + toward.x * fwd + right.x * off, y, S.z + toward.z * fwd + right.z * off);
    let fov = 50, base, alt;
    switch (kind) {
      case 'close':
        look.y = floor + 1.5; fov = 42;
        base = at(gap * 0.36, side * 0.62, floor + 1.6);
        alt = at(gap * 0.36, -side * 0.62, floor + 1.6);
        break;
      case 'ots': {
        const L = listenerPos ?? S;
        const away = new THREE.Vector3(L.x - S.x, 0, L.z - S.z);
        if (away.lengthSq() < 0.04) away.copy(toward);
        away.normalize();
        const awayRight = new THREE.Vector3(-away.z, 0, away.x);
        base = new THREE.Vector3(L.x + away.x * 1.7 + awayRight.x * 0.85, floor + 1.72, L.z + away.z * 1.7 + awayRight.z * 0.85);
        alt = new THREE.Vector3(L.x + away.x * 1.7 - awayRight.x * 0.85, floor + 1.72, L.z + away.z * 1.7 - awayRight.z * 0.85);
        fov = 46;
        break;
      }
      case 'wide':
        look.y = floor + 1.1; fov = 62;
        base = at(gap * 0.4 + 2.4, side + 1.5, floor + 3.1);
        alt = at(gap * 0.4 + 2.4, -(side + 1.5), floor + 3.1);
        break;
      case 'low':
        base = at(gap * 0.4, side * 0.8, floor + 1.02);
        alt = at(gap * 0.4, -side * 0.8, floor + 1.02);
        break;
      default: // medium
        look.y = floor + 1.24; fov = 50;
        base = at(gap * 0.45, side, floor + 1.98);
        alt = at(gap * 0.45, -side, floor + 1.98);
        break;
    }
    const others = avoid.filter(p => p && Math.hypot(p.x - S.x, p.z - S.z) > 0.35);
    const cands = [base, alt, base.clone().setY(base.y + 0.6), alt.clone().setY(alt.y + 0.6),
      at(gap * 0.5, side * 1.3, floor + 1.7)];
    let cam = this._pickCam(look, cands, others);
    if (!cam) {
      // Nothing fully clear: use the spot with the most room around it.
      let room = -1;
      for (const c of cands) {
        let m = 99;
        for (const p of others) m = Math.min(m, Math.hypot(c.x - p.x, c.z - p.z));
        if (m > room) { room = m; cam = c; }
      }
      cam ??= base;
    }
    const under = this._floorBelow(cam.x, cam.z, cam.y + 2.2);
    if (under != null) cam.y = Math.max(cam.y, under + 1.35);
    if (cam.distanceTo(look) < 0.7) cam.copy(look).addScaledVector(toward, 1.6).setY(floor + 1.7);
    return { cam, look, fov };
  }

  async _stageSpeakers(lines, boss, cast) {
    const known = new Set(cast.map(a => a.key));
    const staged = [];
    for (const line of lines) {
      if (!line.who || line.stan || line.focus === 'boss') continue;
      const key = actorKey(line.who);
      if (!/^[a-z0-9_]+$/i.test(key) || ['peter', 'peterparker', 'spiderman'].includes(key) || known.has(key)) continue;
      known.add(key);
      const i = staged.length;
      staged.push({ key, at: [i % 2 ? 2.4 : -2.4, 3.2 + Math.floor(i / 2) * 1.4] });
    }
    if (staged.length) cast.push(...await this._spawnCast(staged));
  }

  _setStoryPose(key, pose, cast) {
    if (key === 'peter' || key === 'peterparker' || key === 'spiderman') this.controller.emote = pose;
    else {
      const actor = cast.find(a => a.key === key);
      if (actor) actor.emote = pose;
    }
  }

  /** A cast member bursts into LEGO pieces and a shower of studs (Combat's own break-apart). */
  _shatterActor(actor) {
    if (!actor?.rig || !actor.root.visible) return;
    const pos = actor.root.position.clone();
    clearInterval(actor.tick);
    actor.root.updateMatrixWorld(true);
    this.combat.shatter(actor.rig, pos.clone().setY(pos.y + 0.3));
    actor.root.visible = false;
    this.combat.sfx?.play('boom', { pos, vol: 0.55, pitch: 1.25 });
    this.hud.burstStuds?.(pos.clone().setY(pos.y + 0.6), 1000, pos.y - 0.5);
    this.ui.shake?.(0.15);
  }

  _animateStoryActor(actor, action) {
    if (action !== 'collapse') return Promise.resolve();
    actor.emote = 'grief';
    const from = actor.root.rotation.z, y = actor.root.position.y;
    const to = Math.PI * 0.36, start = performance.now(), duration = 1600;
    return new Promise(resolve => {
      const tick = now => {
        const t = Math.min(1, (now - start) / duration), ease = t * t * (3 - 2 * t);
        actor.root.rotation.z = from + (to - from) * ease;
        actor.root.position.y = y - 0.18 * ease;
        if (t < 1) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  /** Of 12 facings, the one where the line from the player to every cast spot is free of walls. */
  _clearFacing(spots, yaw0) {
    const meshes = this.landmarks?.meshes ?? [];
    const p = this.controller.root.position, ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3());
    let best = yaw0, bestScore = -1;
    for (let k = 0; k < 12; k++) {
      const yaw = yaw0 + k / 12 * Math.PI * 2, fx = Math.sin(yaw), fz = Math.cos(yaw);
      let score = 0;
      for (const at of spots) {
        const tx = p.x + fz * at[0] + fx * at[1], tz = p.z - fx * at[0] + fz * at[1];
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) + 0.8;
        ray.origin.set(p.x, p.y + 0.6, p.z); ray.direction.set(dx, 0, dz).normalize();
        const hit = meshes.some(m => m.geometry?.boundsTree?.raycastFirst(ray, THREE.DoubleSide, 0, d));
        if (!hit) score++;
      }
      // Prefer the original facing on ties
      if (score > bestScore) { bestScore = score; best = yaw; }
      if (score === spots.length) break;
    }
    return best;
  }

  /** Put the player in a story outfit for this mission (null = back to their own). */
  async _applySuit(suit) {
    const c = this.controller;
    this._ownOutfit ??= c.variant;
    const want = suit ?? this._ownOutfit;
    if (c.variant !== want) await c.setVariant(want);
  }

  /** Stage the scene's characters on real floor, clear of furniture, all facing the group. */
  async _spawnCast(list) {
    const ctrl = this.controller, p = ctrl.root.position;
    const anchors = { ...(this.landmarks?.oscorpAnchors ?? {}), ...(this.landmarks?.bugleAnchors ?? {}) };
    const anchored = list.map(m => (m.anchor && anchors[m.anchor]) ? anchors[m.anchor] : null);
    let yaw = ctrl.root.rotation.y;
    const first = anchored.find(Boolean);
    if (first) yaw = Math.atan2(first.x - p.x, first.z - p.z);
    else yaw = this._clearFacing(list.map(m => m.at ?? [0, 2]), yaw);
    ctrl.root.rotation.y = yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx;
    const out = [], taken = [];
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const want = anchored[i]
        ? anchored[i].clone()
        : new THREE.Vector3(p.x + rx * (m.at?.[0] ?? 0) + fx * (m.at?.[1] ?? 2.4), p.y, p.z + rz * (m.at?.[0] ?? 0) + fz * (m.at?.[1] ?? 2.4));
      const mark = this._standMark(want, p, taken);
      const root = new THREE.Group();
      root.position.set(mark.x, mark.y + 0.5, mark.z);
      root.rotation.y = Math.atan2(p.x - mark.x, p.z - mark.z);
      this.scene.add(root);
      const a = { key: m.key, root, talking: false, gesture: null };
      const palette = this._castPalette(m.key);
      let rig;
      try { rig = await new LegoSpidey({ skin: 'glb:' + (CAST_ALBUM[m.key] ?? m.key), ...palette }).load(); }
      catch (e) {
        console.warn('[Story] using the safe minifig fallback for', m.key, e?.message ?? e);
        try { rig = await new LegoSpidey(palette).load(); }
        catch (fallbackError) { console.warn('[Story] cast member failed to load', m.key, fallbackError?.message ?? fallbackError); this.scene.remove(root); continue; }
      }
      root.add(rig.root);
      a.rig = rig;
      a.emote = m.emote ?? null;
      a.tick = setInterval(() => rig.update(0.033, {
        speed: 0, grounded: true, emote: a.gesture ?? (a.talking ? 'talk' : a.emote),
      }), 33);
      taken.push(mark);
      out.push(a);
    }
    return out;
  }

  _castPalette(key) {
    let hash = 0;
    for (const ch of String(key)) hash = (hash * 33 + ch.charCodeAt(0)) >>> 0;
    const colors = [0x23649a, 0x9f4939, 0x496d4a, 0x75528f, 0x967043, 0x475e70];
    return { torso: colors[hash % colors.length], legs: colors[(hash >>> 5) % colors.length] };
  }

  _dismissCast(cast) {
    for (const a of cast) {
      clearInterval(a.tick);
      this.scene.remove(a.root);
      disposeRigRoot(a.root);
    }
  }

  /** Friends who fight beside you (summoned once per chapter). */
  async _summonAllies(keys) {
    this._allies ??= new Map();
    for (const k of keys) {
      if (this._allies.has(k) || !this.admin) continue;
      try { this._allies.set(k, await this.admin.summonFriend(k)); } catch (e) { console.warn('[Story] ally failed', k, e.message); }
    }
  }

  _dismissAllies() {
    // Allies stay and keep fighting until they fall; a new chapter can summon them again
    this._allies?.clear();
  }

  async _spawnStan() {
    const rig = await new LegoSpidey({ skin: 'stanlee' }).load();
    const root = new THREE.Group();
    root.add(rig.root);
    const p = this.controller.root.position;
    const yaw = this.controller.root.rotation.y;
    const x = p.x + Math.sin(yaw) * 2.6, z = p.z + Math.cos(yaw) * 2.6;
    const floor = this._floorBelow(x, z, p.y + 1.8) ?? (p.y - 0.5);
    root.position.set(x, floor + 0.5, z);
    this.scene.add(root);
    const stan = { root, rig };
    this._stanTick = setInterval(() => rig.update(0.033, { speed: 0, grounded: true }), 33);
    return stan;
  }

  _dismissStan(stan) {
    // Stan wanders off and pops out of existence, cameo-style
    const start = performance.now();
    clearInterval(this._stanTick);
    stan.root.rotation.y += Math.PI;
    const walk = setInterval(() => {
      const t = (performance.now() - start) / 1000;
      stan.root.translateZ(0.06);
      stan.rig.update(0.033, { speed: 2, grounded: true });
      if (t > 2.5) { clearInterval(walk); this.scene.remove(stan.root); disposeRigRoot(stan.root); }
    }, 33);
  }
}
