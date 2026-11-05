// Companion Guide follow-up emails. Copy: guide-followups-v1.md, Larry-approved Nov 5, 2026.
// Placeholders filled at send time. No em or en dashes.
export type Step = "day1" | "week1" | "week2" | "week3" | "week4" | "week5" | "week6" | "week7" | "week8" | "week9" | "week10" | "week11" | "week12";

export const STEPS: { step: Step; stepNum: number; offsetDays: number; subject: string; preview: string; paras: string[] }[] = [
  {
    step: "day1" as Step,
    stepNum: 0,
    offsetDays: 1,
    subject: "Pick up where you left off",
    preview: "Your answers are saved and waiting for you.",
    paras: [
      "We are so glad you said yes to this journey. Thank you for trusting us with something as precious as your marriage.",
      "Here is some good news: everything you write in your Companion Guide is saved. Every answer, every reflection, every prayer. So you never have to finish in one sitting. Open it whenever you have a few quiet minutes, and you will pick up right where you left off.",
      "There is no rush and no grade. Just the two of you, the Lord, and one honest step at a time.",
      "We are praying for you both.",
    ],
  },
  {
    step: "week1" as Step,
    stepNum: 1,
    offsetDays: 7,
    subject: "Where does conflict turn into fighting?",
    preview: "One question to talk about together this week.",
    paras: [
      "Week 1 is all about naming the problem. Conflict and fighting are not the same thing, and that one difference changes everything.",
      "Here is one simple thing to talk about this week: finish this sentence together, \"In our marriage, conflict turns into fighting when...\" Then pick a phrase you can both say out loud in the moment, something like \"I think we just crossed the line.\"",
      "No blame. Just two people on the same side, naming what happens. Your answers in the guide are saved, so you can come back to them anytime.",
    ],
  },
  {
    step: "week2" as Step,
    stepNum: 2,
    offsetDays: 14,
    subject: "What seeds are you planting?",
    preview: "Your mind is a garden. Here is one way to tend it.",
    paras: [
      "Week 2 is about renewing your mind. We love this picture: your mind is a garden, your thoughts are seeds, and your conversations are the harvest.",
      "Here is one simple thing to try this week. Each of you write down one seed you have been sowing about your spouse or about conflict, and one seed you want to plant instead. Then share them with each other, gently.",
      "Keep this verse close: \"Whatever is true, whatever is noble, whatever is right, whatever is pure, whatever is lovely: think about such things.\" (Philippians 4:8)",
    ],
  },
  {
    step: "week3" as Step,
    stepNum: 3,
    offsetDays: 21,
    subject: "Was it a dance or a duel?",
    preview: "One honest look back at your last three disagreements.",
    paras: [
      "Week 3 is about the difference between conflict and fighting. Conflict is about an issue. Fighting is about attacking the person.",
      "Here is one simple thing to try this week. Think back on three recent disagreements and ask together: was it a dance or a duel? Then talk about what made the difference. You may be surprised how much you already know. Write what you notice in your guide, so you can come back to it later.",
      "Ephesians 4:15 says it simply: \"Speak the truth in love.\" Truth and love, together, every time.",
    ],
  },
  {
    step: "week4" as Step,
    stepNum: 4,
    offsetDays: 28,
    subject: "Thermostat, not thermometer",
    preview: "Who sets the temperature in your home?",
    paras: [
      "Week 4 is about maturity and leadership. The goal is not just to argue more politely. It is to grow up into Christ in how we handle hard moments.",
      "Here is one simple thing to try this week. A thermometer only reports the temperature. A thermostat sets it. Ask yourself: what temperature do I usually bring into a hard conversation, and what temperature do I want to set? Then choose one concrete way you will set it this week.",
      "You do not have to wait for your spouse to go first. One of you can set the tone.",
    ],
  },
  {
    step: "week5" as Step,
    stepNum: 5,
    offsetDays: 35,
    subject: "Praying in the middle of the mess",
    preview: "Inviting God in, and choosing your plan.",
    paras: [
      "Week 5 is about inviting God into your conflict and choosing your plan. Most of us pray about our marriage. Fewer of us pray right inside the tension, before the harsh words or the cold silence.",
      "Here is one simple thing to try this week. Each of you write a short \"middle of the mess\" prayer, just a sentence or two you can pray the next time things get tense. Then talk about which plan you each commit to working on yourself, starting now.",
      "Jesus showed us the way: \"But Jesus often withdrew to lonely places and prayed.\" (Luke 5:16)",
    ],
  },
  {
    step: "week6" as Step,
    stepNum: 6,
    offsetDays: 42,
    subject: "Sit down, calm down",
    preview: "Your Safety Plan for the next hard conversation.",
    paras: [
      "Week 6 is the Safety Plan. Preparation turns a battlefield into sacred ground.",
      "Here is one simple thing to try this week. Before you bring up something that hurts, walk through the first steps of SCIP. Sit down: where and when will you do this? Calm down: what breathing or calming practice will help you? Write your answers in the guide so they are ready when you need them.",
      "We love this promise: \"You will keep in perfect peace those whose minds are steadfast, because they trust in You.\" (Isaiah 26:3)",
    ],
  },
  {
    step: "week7" as Step,
    stepNum: 7,
    offsetDays: 49,
    subject: "What does winning look like now?",
    preview: "Redefining the win, and centering your heart with ACTS.",
    paras: [
      "Week 7 begins the Anti-Fight Plan. Never fighting again does not mean never disagreeing. It means putting down the emotional weapons.",
      "Here is one simple thing to talk about this week. What was your old definition of winning an argument? Now write a new one, in your own words, together. Then before your next hard talk, center your heart with ACTS, starting with Adoration and Confession.",
      "\"Can two walk together unless they have agreed to do so?\" (Amos 3:3) This week, agree on what winning really means.",
    ],
  },
  {
    step: "week8" as Step,
    stepNum: 8,
    offsetDays: 56,
    subject: "Listen before you explain",
    preview: "Responding with LUV when your spouse shares their pain.",
    paras: [
      "Week 8 is about responding with LUV. The most overlooked moment in any conflict is the one right after your spouse finishes sharing their pain. Our instinct is to explain or defend.",
      "Here is one simple thing to try this week. The next time your spouse shares something hard, do not explain yet. Just try this: \"It makes sense that you'd feel that way, because...\" and finish it honestly.",
      "\"Everyone should be quick to listen, slow to speak and slow to become angry.\" (James 1:19) Quick to listen. That is the whole week in four words.",
    ],
  },
  {
    step: "week9" as Step,
    stepNum: 9,
    offsetDays: 63,
    subject: "The problem is the problem",
    preview: "Finding a solution together, then celebrating it.",
    paras: [
      "Week 9 is about solutions and celebration. Once your spouse feels heard, understood, and validated, a real solution becomes possible. Remember: the problem is the problem. Your spouse is not the problem.",
      "Here is one simple thing to try this week. When you settle something, do not just move on. Pause and say out loud what just happened, and speak one blessing over your future together. It does not need fireworks.",
      "\"If two of you on earth agree about anything they ask for, it will be done for them by my Father in heaven.\" (Matthew 18:19)",
    ],
  },
  {
    step: "week10" as Step,
    stepNum: 10,
    offsetDays: 70,
    subject: "Do you have a safe phrase?",
    preview: "Building your Stop-Loss agreement before you need it.",
    paras: [
      "Week 10 is about Stop-Loss and 3D communication. Even with every plan in place, the flesh sometimes tries to take the wheel. A Stop-Loss is a grace-based plan you decide on ahead of time.",
      "Here is one simple thing to do together this week. Choose your safe phrase, agree on how long a pause will be, and talk about what each of you will do during the pause. Regulate, do not rehearse.",
      "\"Better a patient person than a warrior, one with self-control than one who takes a city.\" (Proverbs 16:32)",
    ],
  },
  {
    step: "week11" as Step,
    stepNum: 11,
    offsetDays: 77,
    subject: "Catching it mid-sentence",
    preview: "Grace for old habits, and the gift of a fresh start.",
    paras: [
      "Week 11 is about old habits and forgiveness. Old patterns will try to come back. Expect it, and meet it with grace instead of shame. The goal is not perfection. It is catching a slip mid-sentence instead of an hour later.",
      "Here is one simple thing to try this week. Practice saying, \"I'm sorry, I just heard myself. Let me try that again.\" Or write your own version in the guide.",
      "\"Be kind and compassionate to one another, forgiving each other, just as in Christ God forgave you.\" (Ephesians 4:32)",
    ],
  },
  {
    step: "week12" as Step,
    stepNum: 12,
    offsetDays: 84,
    subject: "The safest place they know",
    preview: "One brave question, and the legacy you are building.",
    paras: [
      "Week 12 is about being a safe place and leaving a lasting legacy. None of these tools matter unless you become the safest place your spouse knows.",
      "Here is one brave question to ask this week: \"Is there anything you've stopped telling me because you're not sure how I'll react?\" Listen to the answer with love. Then pick one tool from this guide you both commit to keeping as a lasting habit.",
      "\"Blessed are the peacemakers, for they will be called children of God.\" (Matthew 5:9) We are so proud of you both.",
    ],
  },
];

const esc = (v: string) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderGuideEmail(o: {
  step: Step;
  firstName: string;
  guideUrl: string;
  signinUrl: string;
  forgotUrl: string;
  unsubUrl: string;
  testPrefix?: string;
}): { subject: string; html: string } {
  const meta = STEPS.find((s) => s.step === o.step)!;
  const greet = o.firstName ? `Hi ${esc(o.firstName)},` : "Hi,";
  const P = (s: string) => `<p style="margin:0 0 16px;">${s}</p>`;
  const body = meta.paras.map((p) => P(esc(p).replace(/\n/g, "<br>"))).join("\n");
  // Verse lines in source use straight quotes; keep them.
  const html = `<div style="display:none;max-height:0;overflow:hidden;">${esc(meta.preview)}</div>
<div style="background:#F7F3EA;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;color:#16261C;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E4DCCB;padding:32px;">
    <p style="margin:0 0 22px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8A6330;">Never Fight or Argue Again &middot; Companion Guide</p>
    <div style="font-size:16px;line-height:1.6;">
      ${P(greet)}
      ${body}
      <p style="margin:0 0 16px;"><a href="${o.guideUrl}" style="display:inline-block;background:#0D2D1D;color:#F8F4E9;padding:10px 18px;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;">Open my Companion Guide</a></p>
      <p style="margin:0 0 16px;">Need to sign in? <a href="${o.signinUrl}" style="color:#8A6330;">Sign in here</a>. Forgot your password? <a href="${o.forgotUrl}" style="color:#8A6330;">Reset it here</a>.</p>
      <p style="margin:0;">With love,<br>Larry &amp; Ro</p>
    </div>
  </div>
  <p style="max-width:560px;margin:16px auto 0;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#5C6B60;text-align:center;">You're receiving this because you bought the Companion Guide with your event books.<br>
  Questions? <a href="mailto:hello@neverfightorargue.com" style="color:#5C6B60;">hello@neverfightorargue.com</a>
  &middot; <a href="${o.unsubUrl}" style="color:#5C6B60;">Unsubscribe from these guide emails</a></p>
</div>`;
  return { subject: `${o.testPrefix ?? ""}${meta.subject}`, html };
}

