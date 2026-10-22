// Station dataset built by `bun run stations:build` from Opinet's CSV.
// Imported statically so it ships with the server bundle.
import dataset from "@/data/stations.json";

import type { StationDataset } from "./types";

export const stationDataset = dataset as StationDataset;
