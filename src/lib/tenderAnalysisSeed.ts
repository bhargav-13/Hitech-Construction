// AUTO-GENERATED from the client tender-analysis workbook via
// scripts/generate-tender-analysis-seed.mjs. Regenerate rather than hand-edit.
//
// Source: "20cr" sheet — tender 287517, Rajkot Municipal Corporation (₹20.90 Cr).
// The workbook's separate LABOUR / MATERIAL sheets have been folded onto the BOQ lines they belong
// to, so every line carries its own rates. Item families come from the sheet's own Sub Total SUM()
// ranges, not from the Sr No prefixes — rows 1–6 are one excavation family with no shared stem.
import type { BoqLine, BoqGroup, ExpenseLine, RateLibraryItem } from "./tenderAnalysisTypes";

/** The BOQ as the department priced it, with our own material / labour / other rates per line. */
export const ANALYSIS_BOQ_SEED: BoqLine[] = [
  {
    "id": "bl-1",
    "srNo": "1",
    "description": "Excavation trench Soft Murrum/Clay/Sand (all lifts)",
    "qty": 42940,
    "unit": "Cu.m",
    "rate": 155.5,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 12.403727655296155,
    "groupKey": "g1"
  },
  {
    "id": "bl-2",
    "srNo": "2",
    "description": "Excavation trench Soft Rock (0–1.5 m)",
    "qty": 21470,
    "unit": "Cu.m",
    "rate": 345,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 27.51952437991752,
    "groupKey": "g1"
  },
  {
    "id": "bl-3",
    "srNo": "3",
    "description": "Excavation trench Soft Murrum (1.5–3.0 m)",
    "qty": 21470,
    "unit": "Cu.m",
    "rate": 171.5,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 13.679995452625665,
    "groupKey": "g1"
  },
  {
    "id": "bl-4",
    "srNo": "4",
    "description": "Excavation trench Soft/Hard Rock (1.5–3.0 m)",
    "qty": 4300,
    "unit": "Cu.m",
    "rate": 614.5,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 49.01666009118642,
    "groupKey": "g1"
  },
  {
    "id": "bl-5",
    "srNo": "5",
    "description": "Breaking of Cement Concrete",
    "qty": 480,
    "unit": "Cu.m",
    "rate": 410,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 32.70436230656864,
    "groupKey": "g1"
  },
  {
    "id": "bl-6",
    "srNo": "6",
    "description": "Excavation of Paver Road",
    "qty": 31734,
    "unit": "Sq.m",
    "rate": 108,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 8.614807631974179,
    "groupKey": "g1"
  },
  {
    "id": "bl-7",
    "srNo": "7a",
    "description": "100 mm DI K7 Pipe Supply",
    "qty": 24750,
    "unit": "Rmt",
    "rate": 968,
    "materialRate": 823,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g8"
  },
  {
    "id": "bl-8",
    "srNo": "7b",
    "description": "150 mm DI K7 Pipe Supply",
    "qty": 865,
    "unit": "Rmt",
    "rate": 1425,
    "materialRate": 1180,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g8"
  },
  {
    "id": "bl-9",
    "srNo": "7c",
    "description": "200 mm DI K7 Pipe Supply",
    "qty": 5055,
    "unit": "Rmt",
    "rate": 1814,
    "materialRate": 1335,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g8"
  },
  {
    "id": "bl-10",
    "srNo": "7d",
    "description": "300 mm DI K7 Pipe Supply",
    "qty": 3800,
    "unit": "Rmt",
    "rate": 3000,
    "materialRate": 2127,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g8"
  },
  {
    "id": "bl-11",
    "srNo": "7e",
    "description": "500 mm DI K7 Pipe Supply",
    "qty": 4215,
    "unit": "Rmt",
    "rate": 6275,
    "materialRate": 4977,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g8"
  },
  {
    "id": "bl-12",
    "srNo": "8a",
    "description": "Laying & Jointing 100 mm DI Pipe",
    "qty": 24750,
    "unit": "Rmt",
    "rate": 53,
    "materialRate": null,
    "labourRate": 230,
    "otherRate": null,
    "groupKey": "g14"
  },
  {
    "id": "bl-13",
    "srNo": "8b",
    "description": "Laying & Jointing 150 mm DI Pipe",
    "qty": 865,
    "unit": "Rmt",
    "rate": 88,
    "materialRate": null,
    "labourRate": 230,
    "otherRate": null,
    "groupKey": "g14"
  },
  {
    "id": "bl-14",
    "srNo": "8c",
    "description": "Laying & Jointing 200 mm DI Pipe",
    "qty": 5055,
    "unit": "Rmt",
    "rate": 99,
    "materialRate": null,
    "labourRate": 250,
    "otherRate": null,
    "groupKey": "g14"
  },
  {
    "id": "bl-15",
    "srNo": "8d",
    "description": "Laying & Jointing 300 mm DI Pipe",
    "qty": 3800,
    "unit": "Rmt",
    "rate": 169,
    "materialRate": null,
    "labourRate": 300,
    "otherRate": null,
    "groupKey": "g14"
  },
  {
    "id": "bl-16",
    "srNo": "8e",
    "description": "Laying & Jointing 500 mm DI Pipe",
    "qty": 4215,
    "unit": "Rmt",
    "rate": 354,
    "materialRate": null,
    "labourRate": 450,
    "otherRate": null,
    "groupKey": "g14"
  },
  {
    "id": "bl-17",
    "srNo": "9a",
    "description": "DI Fittings Socket & Spigot (80–300 mm)",
    "qty": 68940,
    "unit": "Kg",
    "rate": 180,
    "materialRate": 130,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g20"
  },
  {
    "id": "bl-18",
    "srNo": "9b",
    "description": "DI Fittings Socket & Spigot (350–500 mm)",
    "qty": 8430,
    "unit": "Kg",
    "rate": 200,
    "materialRate": 130,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g20"
  },
  {
    "id": "bl-19",
    "srNo": "9c",
    "description": "DI Fittings Flanged (80–300 mm)",
    "qty": 27576,
    "unit": "Kg",
    "rate": 190,
    "materialRate": 140,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g20"
  },
  {
    "id": "bl-20",
    "srNo": "9d",
    "description": "DI Fittings Flanged (350–500 mm)",
    "qty": 3372,
    "unit": "Kg",
    "rate": 210,
    "materialRate": 140,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g20"
  },
  {
    "id": "bl-21",
    "srNo": "10",
    "description": "MS Specials & Valve Chamber Frame",
    "qty": 35000,
    "unit": "Kg",
    "rate": 167.5,
    "materialRate": 160,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g20"
  },
  {
    "id": "bl-22",
    "srNo": "11a",
    "description": "Job work 100 mm Pipe",
    "qty": 2,
    "unit": "Job",
    "rate": 407,
    "materialRate": null,
    "labourRate": 2000,
    "otherRate": null,
    "groupKey": "g27"
  },
  {
    "id": "bl-23",
    "srNo": "11b",
    "description": "Job work 150 mm Pipe",
    "qty": 2,
    "unit": "Job",
    "rate": 497,
    "materialRate": null,
    "labourRate": 3000,
    "otherRate": null,
    "groupKey": "g27"
  },
  {
    "id": "bl-24",
    "srNo": "11c",
    "description": "Job work 200 mm Pipe",
    "qty": 2,
    "unit": "Job",
    "rate": 715,
    "materialRate": null,
    "labourRate": 8000,
    "otherRate": null,
    "groupKey": "g27"
  },
  {
    "id": "bl-25",
    "srNo": "11d",
    "description": "Job work 300 mm Pipe",
    "qty": 5,
    "unit": "Job",
    "rate": 1305,
    "materialRate": null,
    "labourRate": 15000,
    "otherRate": null,
    "groupKey": "g27"
  },
  {
    "id": "bl-26",
    "srNo": "11e",
    "description": "Job work 500 mm Pipe",
    "qty": 5,
    "unit": "Job",
    "rate": 2208,
    "materialRate": null,
    "labourRate": 25000,
    "otherRate": null,
    "groupKey": "g27"
  },
  {
    "id": "bl-27",
    "srNo": "12",
    "description": "Welding MS Pipe (6–10 mm)",
    "qty": 2000,
    "unit": "Cm",
    "rate": 30,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 2.3930021199928273,
    "groupKey": "g33"
  },
  {
    "id": "bl-28",
    "srNo": "13",
    "description": "Cutting DI Pipe (80–200 mm)",
    "qty": 200,
    "unit": "Cut",
    "rate": 244,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 19.463083909274996,
    "groupKey": "g33"
  },
  {
    "id": "bl-29",
    "srNo": "14",
    "description": "Cutting DI Pipe (250–350 mm)",
    "qty": 120,
    "unit": "Cut",
    "rate": 441,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 35.177131163894565,
    "groupKey": "g33"
  },
  {
    "id": "bl-30",
    "srNo": "15",
    "description": "Cutting DI Pipe (400–500 mm)",
    "qty": 50,
    "unit": "Cut",
    "rate": 705,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 56.23554981983145,
    "groupKey": "g33"
  },
  {
    "id": "bl-31",
    "srNo": "16a",
    "description": "100 mm Sluice Valve Supply",
    "qty": 11,
    "unit": "No",
    "rate": 16651,
    "materialRate": 8053,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g38"
  },
  {
    "id": "bl-32",
    "srNo": "16b",
    "description": "150 mm Sluice Valve Supply",
    "qty": 6,
    "unit": "No",
    "rate": 25148,
    "materialRate": 12376,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g38"
  },
  {
    "id": "bl-33",
    "srNo": "16c",
    "description": "200 mm Sluice Valve Supply",
    "qty": 48,
    "unit": "No",
    "rate": 43532,
    "materialRate": 22030,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g38"
  },
  {
    "id": "bl-34",
    "srNo": "16d",
    "description": "300 mm Sluice Valve Supply",
    "qty": 40,
    "unit": "No",
    "rate": 81649,
    "materialRate": 39659,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g38"
  },
  {
    "id": "bl-35",
    "srNo": "16e",
    "description": "500 mm Sluice Valve Supply",
    "qty": 16,
    "unit": "No",
    "rate": 225164,
    "materialRate": 145224,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g38"
  },
  {
    "id": "bl-36",
    "srNo": "17a",
    "description": "100 mm Valve Laying",
    "qty": 11,
    "unit": "No",
    "rate": 346,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 27.59929111725061,
    "groupKey": "g44"
  },
  {
    "id": "bl-37",
    "srNo": "17b",
    "description": "150 mm Valve Laying",
    "qty": 6,
    "unit": "No",
    "rate": 400,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 31.906694933237702,
    "groupKey": "g44"
  },
  {
    "id": "bl-38",
    "srNo": "17c",
    "description": "200 mm Valve Laying",
    "qty": 48,
    "unit": "No",
    "rate": 462,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 36.852232647889544,
    "groupKey": "g44"
  },
  {
    "id": "bl-39",
    "srNo": "17d",
    "description": "300 mm Valve Laying",
    "qty": 40,
    "unit": "No",
    "rate": 728,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 58.07018477849262,
    "groupKey": "g44"
  },
  {
    "id": "bl-40",
    "srNo": "17e",
    "description": "500 mm Valve Laying",
    "qty": 16,
    "unit": "No",
    "rate": 1361,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 108.56252951034128,
    "groupKey": "g44"
  },
  {
    "id": "bl-41",
    "srNo": "18a",
    "description": "100 mm Air Valve",
    "qty": 5,
    "unit": "No",
    "rate": 21437,
    "materialRate": 9300,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g50"
  },
  {
    "id": "bl-42",
    "srNo": "18b",
    "description": "150 mm Air Valve",
    "qty": 5,
    "unit": "No",
    "rate": 44347,
    "materialRate": 13139,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g50"
  },
  {
    "id": "bl-43",
    "srNo": "19a",
    "description": "100 mm Air Valve Fixing",
    "qty": 5,
    "unit": "No",
    "rate": 186,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 14.836613143955532,
    "groupKey": "g53"
  },
  {
    "id": "bl-44",
    "srNo": "19b",
    "description": "150 mm Air Valve Fixing",
    "qty": 5,
    "unit": "No",
    "rate": 226,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 18.027282637279303,
    "groupKey": "g53"
  },
  {
    "id": "bl-45",
    "srNo": "20",
    "description": "Valve Chamber Construction",
    "qty": 131,
    "unit": "No",
    "rate": 22843.48,
    "materialRate": 22843.48,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "s20"
  },
  {
    "id": "bl-46",
    "srNo": "21",
    "description": "Thrust Block PCC Work",
    "qty": 36,
    "unit": "Cu.m",
    "rate": 4626,
    "materialRate": 4626,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g58"
  },
  {
    "id": "bl-47",
    "srNo": "22",
    "description": "Removal of Interlocking Block",
    "qty": 3447,
    "unit": "Sq.m",
    "rate": 24,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 1.914401695994262,
    "groupKey": "g58"
  },
  {
    "id": "bl-48",
    "srNo": "26a",
    "description": "15 mm House Connection",
    "qty": 6000,
    "unit": "No",
    "rate": 650,
    "materialRate": 350,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g61"
  },
  {
    "id": "bl-49",
    "srNo": "26b",
    "description": "25 mm House Connection",
    "qty": 50,
    "unit": "No",
    "rate": 1050,
    "materialRate": 400,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g61"
  },
  {
    "id": "bl-50",
    "srNo": "26c",
    "description": "40 mm House Connection",
    "qty": 20,
    "unit": "No",
    "rate": 2330,
    "materialRate": 500,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g61"
  },
  {
    "id": "bl-51",
    "srNo": "26d",
    "description": "50 mm House Connection",
    "qty": 20,
    "unit": "No",
    "rate": 2563,
    "materialRate": 1000,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g61"
  },
  {
    "id": "bl-52",
    "srNo": "26e",
    "description": "65 mm House Connection",
    "qty": 10,
    "unit": "No",
    "rate": 2819.3,
    "materialRate": 1000,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g61"
  },
  {
    "id": "bl-53",
    "srNo": "26f",
    "description": "80 mm House Connection",
    "qty": 10,
    "unit": "No",
    "rate": 3101.23,
    "materialRate": 1500,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g61"
  },
  {
    "id": "bl-54",
    "srNo": "26g",
    "description": "100 mm House Connection",
    "qty": 10,
    "unit": "No",
    "rate": 3411.35,
    "materialRate": 2000,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g61"
  },
  {
    "id": "bl-55",
    "srNo": "27a",
    "description": "15 mm Labour HC",
    "qty": 6000,
    "unit": "No",
    "rate": 309,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 24.647921835926123,
    "groupKey": "g69"
  },
  {
    "id": "bl-56",
    "srNo": "27b",
    "description": "25 mm Labour HC",
    "qty": 50,
    "unit": "No",
    "rate": 345,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 27.519524379917517,
    "groupKey": "g69"
  },
  {
    "id": "bl-57",
    "srNo": "27c",
    "description": "40 mm Labour HC",
    "qty": 20,
    "unit": "No",
    "rate": 400,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 31.906694933237702,
    "groupKey": "g69"
  },
  {
    "id": "bl-58",
    "srNo": "27d",
    "description": "50 mm Labour HC",
    "qty": 20,
    "unit": "No",
    "rate": 440,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 35.09736442656147,
    "groupKey": "g69"
  },
  {
    "id": "bl-59",
    "srNo": "27e",
    "description": "65 mm Labour HC",
    "qty": 10,
    "unit": "No",
    "rate": 484,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 38.60710086921762,
    "groupKey": "g69"
  },
  {
    "id": "bl-60",
    "srNo": "27f",
    "description": "80 mm Labour HC",
    "qty": 10,
    "unit": "No",
    "rate": 532.4,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 42.46781095613938,
    "groupKey": "g69"
  },
  {
    "id": "bl-61",
    "srNo": "27g",
    "description": "100 mm Labour HC",
    "qty": 10,
    "unit": "No",
    "rate": 585.64,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 46.714592051753314,
    "groupKey": "g69"
  },
  {
    "id": "bl-62",
    "srNo": "28",
    "description": "Road Excavation upto 30 cm",
    "qty": 31734,
    "unit": "Sq.m",
    "rate": 15,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 1.1965010599964137,
    "groupKey": "g77"
  },
  {
    "id": "bl-63",
    "srNo": "29",
    "description": "Road Excavation addl depth",
    "qty": 31734,
    "unit": "Sq.m",
    "rate": 2.5,
    "materialRate": null,
    "labourRate": null,
    "otherRate": 0.19941684333273563,
    "groupKey": "g77"
  },
  {
    "id": "bl-64",
    "srNo": "30",
    "description": "Granular Sub Base",
    "qty": 4761,
    "unit": "Cu.m",
    "rate": 753,
    "materialRate": 753,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g80"
  },
  {
    "id": "bl-65",
    "srNo": "31",
    "description": "Wet Mix Macadam",
    "qty": 4761,
    "unit": "Cu.m",
    "rate": 1008,
    "materialRate": 1008,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g80"
  },
  {
    "id": "bl-66",
    "srNo": "32",
    "description": "Rolling Work",
    "qty": 31734,
    "unit": "Sq.m",
    "rate": 9,
    "materialRate": 9,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g80"
  },
  {
    "id": "bl-67",
    "srNo": "33",
    "description": "Removal of Murrum",
    "qty": 15347,
    "unit": "Sq.m",
    "rate": 15,
    "materialRate": 15,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g80"
  },
  {
    "id": "bl-68",
    "srNo": "34",
    "description": "Disposal Excavated Material",
    "qty": 3174,
    "unit": "Cu.m",
    "rate": 171,
    "materialRate": 171,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g80"
  },
  {
    "id": "bl-69",
    "srNo": "35",
    "description": "Tack Coat",
    "qty": 190305,
    "unit": "Sq.m",
    "rate": 28,
    "materialRate": 27.999999999999996,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g80"
  },
  {
    "id": "bl-70",
    "srNo": "36",
    "description": "Bituminous Lean Bound Macadam",
    "qty": 3490.74,
    "unit": "MT",
    "rate": 2579,
    "materialRate": 2579,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g80"
  },
  {
    "id": "bl-71",
    "srNo": "37",
    "description": "SDBC 13 mm",
    "qty": 10943,
    "unit": "MT",
    "rate": 3290,
    "materialRate": 3290,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g80"
  },
  {
    "id": "bl-72",
    "srNo": "38",
    "description": "SDBC Laying",
    "qty": 10943,
    "unit": "Cu.m",
    "rate": 305,
    "materialRate": 305,
    "labourRate": null,
    "otherRate": null,
    "groupKey": "g80"
  }
];

/** Item families, keyed to BoqLine.groupKey. */
export const ANALYSIS_GROUP_SEED: BoqGroup[] = [
  {
    "key": "g1",
    "label": "Excavation trench Soft Murrum/Clay/Sand (all lifts)"
  },
  {
    "key": "g8",
    "label": "DI K7 Pipe Supply"
  },
  {
    "key": "g14",
    "label": "Laying & Jointing … DI Pipe"
  },
  {
    "key": "g20",
    "label": "DI Fittings Socket & Spigot (80–300 mm)"
  },
  {
    "key": "g27",
    "label": "Job work … Pipe"
  },
  {
    "key": "g33",
    "label": "Welding MS Pipe (6–10 mm)"
  },
  {
    "key": "g38",
    "label": "Sluice Valve Supply"
  },
  {
    "key": "g44",
    "label": "Valve Laying"
  },
  {
    "key": "g50",
    "label": "Air Valve"
  },
  {
    "key": "g53",
    "label": "Air Valve Fixing"
  },
  {
    "key": "s20",
    "label": "Valve Chamber Construction"
  },
  {
    "key": "g58",
    "label": "Thrust Block PCC Work"
  },
  {
    "key": "g61",
    "label": "House Connection"
  },
  {
    "key": "g69",
    "label": "Labour HC"
  },
  {
    "key": "g77",
    "label": "Road Excavation"
  },
  {
    "key": "g80",
    "label": "Granular Sub Base"
  }
];

/** Site overheads, carried as a percentage of the tender value the way the sheet does it. */
export const ANALYSIS_EXPENSE_SEED: ExpenseLine[] = [
  {
    "id": "ex-1",
    "item": "profit",
    "basis": "PCT_OF_TENDER",
    "value": 5
  },
  {
    "id": "ex-2",
    "item": "SITE SUPERVISON",
    "basis": "PCT_OF_TENDER",
    "value": 1.5
  },
  {
    "id": "ex-3",
    "item": "overhead",
    "basis": "FLAT",
    "value": 0
  },
  {
    "id": "ex-4",
    "item": "rmc cost",
    "basis": "FLAT",
    "value": 0
  }
];

/**
 * Every labour / material rate the workbook has recorded, across all 50 sheets.
 * This is the asset that makes the second analysis quick — matched on name + unit.
 */
export const RATE_LIBRARY_SEED: RateLibraryItem[] = [
  {
    "id": "rl-1",
    "name": "100 mm Air Valve",
    "unit": "no",
    "labourRate": null,
    "materialRate": 9300,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-2",
    "name": "100 mm DI K7 Pipe Supply",
    "unit": "Rmt",
    "labourRate": null,
    "materialRate": 823,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-3",
    "name": "100 mm House Connection",
    "unit": "no",
    "labourRate": null,
    "materialRate": 2000,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-4",
    "name": "100 mm Sluice Valve Supply",
    "unit": "no",
    "labourRate": null,
    "materialRate": 8053,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-5",
    "name": "15 mm House Connection",
    "unit": "no",
    "labourRate": null,
    "materialRate": 350,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-6",
    "name": "150 mm Air Valve",
    "unit": "no",
    "labourRate": null,
    "materialRate": 13139,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-7",
    "name": "150 mm DI K7 Pipe Supply",
    "unit": "Rmt",
    "labourRate": null,
    "materialRate": 1180,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-8",
    "name": "150 mm Sluice Valve Supply",
    "unit": "no",
    "labourRate": null,
    "materialRate": 12376,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-9",
    "name": "200 mm DI K7 Pipe Supply",
    "unit": "Rmt",
    "labourRate": null,
    "materialRate": 1335,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-10",
    "name": "200 mm Sluice Valve Supply",
    "unit": "no",
    "labourRate": null,
    "materialRate": 22030,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-11",
    "name": "25 mm House Connection",
    "unit": "no",
    "labourRate": null,
    "materialRate": 400,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-12",
    "name": "300 mm DI K7 Pipe Supply",
    "unit": "Rmt",
    "labourRate": null,
    "materialRate": 2127,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-13",
    "name": "300 mm Sluice Valve Supply",
    "unit": "no",
    "labourRate": null,
    "materialRate": 39659,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-14",
    "name": "40 mm House Connection",
    "unit": "no",
    "labourRate": null,
    "materialRate": 500,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-15",
    "name": "50 mm House Connection",
    "unit": "no",
    "labourRate": null,
    "materialRate": 1000,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-16",
    "name": "500 mm DI K7 Pipe Supply",
    "unit": "Rmt",
    "labourRate": null,
    "materialRate": 4977,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-17",
    "name": "500 mm Sluice Valve Supply",
    "unit": "no",
    "labourRate": null,
    "materialRate": 145224,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-18",
    "name": "65 mm House Connection",
    "unit": "no",
    "labourRate": null,
    "materialRate": 1000,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-19",
    "name": "80 mm House Connection",
    "unit": "no",
    "labourRate": null,
    "materialRate": 1500,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-20",
    "name": "connection",
    "unit": "nos",
    "labourRate": 350,
    "materialRate": null,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-21",
    "name": "DI Fittings Flanged (350–500 mm)",
    "unit": "Kg",
    "labourRate": null,
    "materialRate": 140,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-22",
    "name": "DI Fittings Flanged (80–300 mm)",
    "unit": "Kg",
    "labourRate": null,
    "materialRate": 140,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-23",
    "name": "DI Fittings Socket & Spigot (350–500 mm)",
    "unit": "Kg",
    "labourRate": null,
    "materialRate": 130,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-24",
    "name": "DI Fittings Socket & Spigot (80–300 mm)",
    "unit": "Kg",
    "labourRate": null,
    "materialRate": 130,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-25",
    "name": "Job work 100 mm Pipe",
    "unit": "nos",
    "labourRate": 2000,
    "materialRate": null,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-26",
    "name": "Job work 150 mm Pipe",
    "unit": "nos",
    "labourRate": 3000,
    "materialRate": null,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-27",
    "name": "Job work 200 mm Pipe",
    "unit": "nos",
    "labourRate": 8000,
    "materialRate": null,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-28",
    "name": "Job work 300 mm Pipe",
    "unit": "nos",
    "labourRate": 15000,
    "materialRate": null,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-29",
    "name": "Job work 500 mm Pipe",
    "unit": "nos",
    "labourRate": 25000,
    "materialRate": null,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-30",
    "name": "Laying & Jointing 100 mm DI Pipe",
    "unit": "mtr",
    "labourRate": 230,
    "materialRate": null,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-31",
    "name": "Laying & Jointing 150 mm DI Pipe",
    "unit": "mtr",
    "labourRate": 230,
    "materialRate": null,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-32",
    "name": "Laying & Jointing 200 mm DI Pipe",
    "unit": "mtr",
    "labourRate": 250,
    "materialRate": null,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-33",
    "name": "Laying & Jointing 300 mm DI Pipe",
    "unit": "mtr",
    "labourRate": 300,
    "materialRate": null,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-34",
    "name": "Laying & Jointing 500 mm DI Pipe",
    "unit": "mtr",
    "labourRate": 450,
    "materialRate": null,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-35",
    "name": "MS Specials & Valve Chamber Frame",
    "unit": "Kg",
    "labourRate": null,
    "materialRate": 160,
    "usageCount": 3,
    "sourceSheets": [
      "20cr",
      "gandhinagar",
      "20 analisis"
    ]
  },
  {
    "id": "rl-36",
    "name": "DI Pipe 100mm",
    "unit": "rmt",
    "labourRate": 400,
    "materialRate": 823,
    "usageCount": 2,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-37",
    "name": "DI Pipe 150mm",
    "unit": "rmt",
    "labourRate": 400,
    "materialRate": 1180,
    "usageCount": 2,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-38",
    "name": "DI Pipe 200mm",
    "unit": "rmt",
    "labourRate": 400,
    "materialRate": 1335,
    "usageCount": 2,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-39",
    "name": "DI Pipe 300mm",
    "unit": "rmt",
    "labourRate": 500,
    "materialRate": 2127,
    "usageCount": 2,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-40",
    "name": "110 mm Dia HDPE Pipe",
    "unit": "Per Mtr.",
    "labourRate": 95,
    "materialRate": null,
    "usageCount": 1,
    "sourceSheets": [
      "UJJAIN"
    ]
  },
  {
    "id": "rl-41",
    "name": "125 mm Dia HDPE Pipe",
    "unit": "Per Mtr.",
    "labourRate": 105,
    "materialRate": null,
    "usageCount": 1,
    "sourceSheets": [
      "UJJAIN"
    ]
  },
  {
    "id": "rl-42",
    "name": "140 mm Dia HDPE Pipe",
    "unit": "Per Mtr.",
    "labourRate": 105,
    "materialRate": null,
    "usageCount": 1,
    "sourceSheets": [
      "UJJAIN"
    ]
  },
  {
    "id": "rl-43",
    "name": "160 mm Dia HDPE Pipe",
    "unit": "Per Mtr.",
    "labourRate": 105,
    "materialRate": null,
    "usageCount": 1,
    "sourceSheets": [
      "UJJAIN"
    ]
  },
  {
    "id": "rl-44",
    "name": "180 mm Dia HDPE Pipe",
    "unit": "Per Mtr.",
    "labourRate": 140,
    "materialRate": null,
    "usageCount": 1,
    "sourceSheets": [
      "UJJAIN"
    ]
  },
  {
    "id": "rl-45",
    "name": "200 mm Dia HDPE Pipe",
    "unit": "Per Mtr.",
    "labourRate": 140,
    "materialRate": null,
    "usageCount": 1,
    "sourceSheets": [
      "UJJAIN"
    ]
  },
  {
    "id": "rl-46",
    "name": "225 mm Dia HDPE Pipe",
    "unit": "Per Mtr.",
    "labourRate": 140,
    "materialRate": null,
    "usageCount": 1,
    "sourceSheets": [
      "UJJAIN"
    ]
  },
  {
    "id": "rl-47",
    "name": "250 mm Dia HDPE Pipe",
    "unit": "Per Mtr.",
    "labourRate": 140,
    "materialRate": null,
    "usageCount": 1,
    "sourceSheets": [
      "UJJAIN"
    ]
  },
  {
    "id": "rl-48",
    "name": "280 mm Dia HDPE Pipe",
    "unit": "Per Mtr.",
    "labourRate": 180,
    "materialRate": null,
    "usageCount": 1,
    "sourceSheets": [
      "UJJAIN"
    ]
  },
  {
    "id": "rl-49",
    "name": "315 mm Dia HDPE Pipe",
    "unit": "Per Mtr.",
    "labourRate": 180,
    "materialRate": null,
    "usageCount": 1,
    "sourceSheets": [
      "UJJAIN"
    ]
  },
  {
    "id": "rl-50",
    "name": "450 dia laying",
    "unit": "rmt",
    "labourRate": 700,
    "materialRate": null,
    "usageCount": 1,
    "sourceSheets": [
      "popatpara"
    ]
  },
  {
    "id": "rl-51",
    "name": "600 dia",
    "unit": "rmt",
    "labourRate": 700,
    "materialRate": null,
    "usageCount": 1,
    "sourceSheets": [
      "punit nagar"
    ]
  },
  {
    "id": "rl-52",
    "name": "Air Valve",
    "unit": "Nos",
    "labourRate": null,
    "materialRate": 9300,
    "usageCount": 1,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-53",
    "name": "Breaking of CC (i/c Disposal Dimolished CC)",
    "unit": "Per Mtr.",
    "labourRate": 100,
    "materialRate": null,
    "usageCount": 1,
    "sourceSheets": [
      "UJJAIN"
    ]
  },
  {
    "id": "rl-54",
    "name": "CID Joint 100mm",
    "unit": "Nos",
    "labourRate": null,
    "materialRate": 900,
    "usageCount": 1,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-55",
    "name": "CID Joint 100mm (Class15)",
    "unit": "Nos",
    "labourRate": null,
    "materialRate": 900,
    "usageCount": 1,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-56",
    "name": "CID Joint 150mm",
    "unit": "Nos",
    "labourRate": null,
    "materialRate": 1000,
    "usageCount": 1,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-57",
    "name": "CID Joint 150mm (Class15)",
    "unit": "Nos",
    "labourRate": null,
    "materialRate": 1000,
    "usageCount": 1,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-58",
    "name": "CID Joint 200mm",
    "unit": "Nos",
    "labourRate": null,
    "materialRate": 1400,
    "usageCount": 1,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-59",
    "name": "CID Joint 200mm (Class15)",
    "unit": "Nos",
    "labourRate": null,
    "materialRate": 1400,
    "usageCount": 1,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-60",
    "name": "DI Specials Flanged",
    "unit": "Kg",
    "labourRate": null,
    "materialRate": 130,
    "usageCount": 1,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-61",
    "name": "DI Specials Socket",
    "unit": "Kg",
    "labourRate": null,
    "materialRate": 130,
    "usageCount": 1,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-62",
    "name": "House Service Connection (Both Sides)",
    "unit": "Per Nos.",
    "labourRate": 450,
    "materialRate": null,
    "usageCount": 1,
    "sourceSheets": [
      "UJJAIN"
    ]
  },
  {
    "id": "rl-63",
    "name": "job",
    "unit": "nos",
    "labourRate": 3500,
    "materialRate": null,
    "usageCount": 1,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-64",
    "name": "Long Collar 100mm",
    "unit": "Nos",
    "labourRate": null,
    "materialRate": 2000,
    "usageCount": 1,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-65",
    "name": "Long Collar 150mm",
    "unit": "Nos",
    "labourRate": null,
    "materialRate": 2200,
    "usageCount": 1,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-66",
    "name": "Long Collar 200mm",
    "unit": "Nos",
    "labourRate": null,
    "materialRate": 4000,
    "usageCount": 1,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-67",
    "name": "MS Specials",
    "unit": "Kg",
    "labourRate": null,
    "materialRate": 130,
    "usageCount": 1,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-68",
    "name": "RCC Work M15",
    "unit": "cum",
    "labourRate": null,
    "materialRate": 4732,
    "usageCount": 1,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-69",
    "name": "Valve 100mm",
    "unit": "Nos",
    "labourRate": null,
    "materialRate": 8053,
    "usageCount": 1,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-70",
    "name": "Valve 150mm",
    "unit": "Nos",
    "labourRate": null,
    "materialRate": 12376,
    "usageCount": 1,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-71",
    "name": "Valve 200mm",
    "unit": "Nos",
    "labourRate": null,
    "materialRate": 22030,
    "usageCount": 1,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-72",
    "name": "Valve 300mm",
    "unit": "Nos",
    "labourRate": null,
    "materialRate": 39659,
    "usageCount": 1,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-73",
    "name": "Valve Chamber",
    "unit": "nos",
    "labourRate": null,
    "materialRate": 23000,
    "usageCount": 1,
    "sourceSheets": [
      "bhavnagar on"
    ]
  },
  {
    "id": "rl-74",
    "name": "Water Connection Refitting",
    "unit": "nos",
    "labourRate": null,
    "materialRate": 700,
    "usageCount": 1,
    "sourceSheets": [
      "bhavnagar on"
    ]
  }
];
