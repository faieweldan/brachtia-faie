import {
  AirVent,
  Armchair,
  Bed,
  Bike,
  Bus,
  Camera,
  Car,
  ChefHat,
  Coffee,
  CookingPot,
  Dumbbell,
  Fan,
  Headphones,
  Home,
  KeyRound,
  Lamp,
  type LucideIcon,
  Moon,
  Package,
  Refrigerator,
  ShieldCheck,
  Shirt,
  ShoppingBasket,
  Scissors,
  Sofa,
  Sparkles,
  Trees,
  Utensils,
  WashingMachine,
  Waves,
  Wifi,
  Wrench,
} from "lucide-react";

const RULES: { match: RegExp; icon: LucideIcon }[] = [
  // Building facilities
  { match: /pool|swim/i, icon: Waves },
  { match: /gym|fitness/i, icon: Dumbbell },
  { match: /squash|court|sport/i, icon: Bike },
  { match: /caf[eé]|food court|canteen/i, icon: ChefHat },
  { match: /barber|salon/i, icon: Scissors },
  { match: /mart|convenience|grocer|shop/i, icon: ShoppingBasket },
  { match: /laundry/i, icon: WashingMachine },
  { match: /vending/i, icon: Package },
  { match: /prayer|surau/i, icon: Moon },
  { match: /security|guard|controlled access/i, icon: ShieldCheck },
  { match: /access card|key|entry/i, icon: KeyRound },
  { match: /cctv|camera|monitor/i, icon: Camera },
  { match: /car ?park|parking/i, icon: Car },
  { match: /shuttle|bus|mrt|transport/i, icon: Bus },
  { match: /garden|outdoor|landscape|park/i, icon: Trees },

  // Included in your stay
  { match: /wi-?fi|internet/i, icon: Wifi },
  { match: /clean|housekeep/i, icon: Sparkles },
  { match: /support|warden|help|24\/7/i, icon: Headphones },
  { match: /maintenance|repair|fix/i, icon: Wrench },

  // Inside your apartment
  { match: /furnish/i, icon: Home },
  { match: /bed/i, icon: Bed },
  { match: /desk|study/i, icon: Lamp },
  { match: /wardrobe|closet|clothes/i, icon: Shirt },
  { match: /air ?-?condition|aircond|cooling/i, icon: AirVent },
  { match: /\bfan\b/i, icon: Fan },
  { match: /kitchen|cook/i, icon: CookingPot },
  { match: /fridge|refrigerator/i, icon: Refrigerator },
  { match: /dining/i, icon: Utensils },
  { match: /sofa|living|lounge/i, icon: Sofa },
  { match: /coffee table/i, icon: Coffee },
  { match: /washing machine|washer/i, icon: WashingMachine },
  { match: /chair|seat/i, icon: Armchair },
];


export function facilityIcon(label: string): LucideIcon {
  return RULES.find((r) => r.match.test(label))?.icon ?? Home;
}
