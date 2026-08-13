export type Review = {
  id: string;
  name: string;
  initials: string;
  rating: number;
  date: string;
  text: string;
};

export const reviewSummary = {
  average: 4.8,
  count: 127,
};

export const reviews: Review[] = [
  {
    id: "r1",
    name: "Aisha Rahman",
    initials: "AR",
    rating: 5,
    date: "2 weeks ago",
    text: "Moved in from Nigeria for my foundation year and the Brachtia team picked me up from the airport and had my room ready. The warden replies fast on WhatsApp. Feels safe as a girl living alone.",
  },
  {
    id: "r2",
    name: "Daniel Tan",
    initials: "DT",
    rating: 5,
    date: "1 month ago",
    text: "Stayed at The Arc for two semesters. Free Wi-Fi actually works, and the monthly cleaning of the common areas keeps the unit decent even with four of us.",
  },
  {
    id: "r3",
    name: "Fatima Al-Zahra",
    initials: "FZ",
    rating: 5,
    date: "1 month ago",
    text: "Twin sharing was the cheapest option I could find near campus that was still clean and fully furnished. Bus stop is a 3 minute walk.",
  },
  {
    id: "r4",
    name: "Kelvin Wong",
    initials: "KW",
    rating: 4,
    date: "2 months ago",
    text: "Good value and the pool and gym are a nice bonus. Electricity is billed separately so budget for that, but everything was explained upfront before I signed.",
  },
  {
    id: "r5",
    name: "Nurul Izzati",
    initials: "NI",
    rating: 5,
    date: "3 months ago",
    text: "Requested a room change mid-semester because of my class schedule and they arranged it within a week. Very student-friendly management.",
  },
  {
    id: "r6",
    name: "Ahmed Hassan",
    initials: "AH",
    rating: 5,
    date: "3 months ago",
    text: "I took the Solstice one-bedroom for my masters. Having my own kitchen and bathroom made a huge difference for focus. Handover was smooth.",
  },
  {
    id: "r7",
    name: "Priya Nair",
    initials: "PN",
    rating: 5,
    date: "4 months ago",
    text: "The viewing was arranged the same day I messaged on WhatsApp. No hidden fees, the deposit breakdown they sent matched exactly what I paid.",
  },
  {
    id: "r8",
    name: "Mohammed Idris",
    initials: "MI",
    rating: 4,
    date: "5 months ago",
    text: "Aircon serviced when I asked and maintenance came within two days. Quiet block, good for studying during finals.",
  },
];
