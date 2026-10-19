/** Intake questions (no dependencies — safe to import in client components). */

export const redFlagQuestions = [
  { id: "weight_loss", label: "Unexplained weight loss recently?" },
  { id: "night_pain", label: "Pain at night that doesn't ease with rest or changing position?" },
  { id: "trauma", label: "A recent significant fall, accident or impact?" },
  { id: "neuro", label: "Numbness, pins and needles or weakness in both legs, or around the groin/saddle area?" },
  { id: "bladder_bowel", label: "Any recent change in bladder or bowel control?" },
  { id: "cancer", label: "A current or previous diagnosis of cancer?" },
  { id: "unwell", label: "Feeling generally unwell, with a fever or night sweats?" },
  { id: "chest", label: "Chest pain, or breathlessness at rest?" },
] as const;

export const dryCuppingContraindications = [
  { id: "bleeding", label: "A bleeding disorder, or taking blood thinners (anticoagulants)?" },
  { id: "skin", label: "Broken skin, a rash, sunburn or a skin condition where cups would go?" },
  { id: "pregnant", label: "Pregnant or possibly pregnant?" },
  { id: "dvt", label: "A history of DVT or blood clots?" },
  { id: "fever", label: "A fever or infection right now?" },
  { id: "surgery", label: "Surgery in the last 6 weeks?" },
] as const;

export const compressionContraindications = [
  { id: "dvt", label: "A current or previous DVT / blood clot?" },
  { id: "circulation", label: "A circulatory or vascular condition (e.g. peripheral arterial disease)?" },
  { id: "heart", label: "Heart failure or an uncontrolled heart condition?" },
  { id: "pregnant", label: "Pregnant or possibly pregnant?" },
  { id: "wounds", label: "Open wounds, infection or a recent fracture in your legs?" },
  { id: "neuropathy", label: "Reduced sensation in your legs (e.g. diabetic neuropathy)?" },
] as const;

export const trainingLevels = ["Recreational", "Regular (3+ times a week)", "Competitive / club", "Elite / professional", "Not currently active"] as const;
export const referralSources = ["Instagram", "Made Running Hub", "Google", "Friend or family", "Running club", "GP / health professional", "Other"] as const;

