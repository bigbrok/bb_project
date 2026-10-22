// Builds data/stations.json from Opinet's "현재 판매가격(주유소)" CSV.
//
//   bun run stations:build                  # price date = the CSV file's modified day (KST)
//   bun run stations:build --date 2026-10-22
//   bun run stations:build --retry-missed   # ask again for stations not found before
//   bun run stations:build --region 서울     # only stations whose 지역 starts with 서울
//
// Addresses are geocoded with Kakao when KAKAO_REST_API_KEY is set (Bun reads
// .env.local), otherwise with the public Nominatim server, one request at a
// time within its usage policy. Found coordinates are cached in
// data/station-coords.json and saved as the run goes, so an interrupted run
// resumes where it stopped.

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { StationDataset } from "../features/stations/types";
import {
  buildDataset,
  kakaoGeocoder,
  nominatimGeocoder,
  parseOpinetCsv,
  type CoordsCache,
  type Geocoder,
} from "./stations/dataset";

const DATA_DIR = fileURLToPath(new URL("../data", import.meta.url));
const CSV_PATH = join(DATA_DIR, "opinet-current-prices.csv");
const COORDS_PATH = join(DATA_DIR, "station-coords.json");
const MISSED_PATH = join(DATA_DIR, "station-coords-missed.json");
const DATASET_PATH = join(DATA_DIR, "stations.json");

function readJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf-8")) as T) : fallback;
}

function flagValue(name: string) {
  const flag = process.argv.indexOf(name);
  return flag === -1 ? undefined : process.argv[flag + 1];
}

function priceDate() {
  const flag = process.argv.indexOf("--date");
  if (flag !== -1) {
    const value = process.argv[flag + 1];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) throw new Error("--date는 YYYY-MM-DD 형식이어야 합니다.");
    return value;
  }
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(statSync(CSV_PATH).mtime);
}

async function main() {
  const region = flagValue("--region");
  const allStations = parseOpinetCsv(readFileSync(CSV_PATH));
  const csv = region ? allStations.filter((s) => s.region.startsWith(region)) : allStations;
  if (region) console.log(`지역 "${region}"만 처리합니다.`);
  const cache = readJson<CoordsCache>(COORDS_PATH, {});
  // Addresses already asked without success, so the same query is not repeated.
  const recordedMissed = readJson<Record<string, string>>(MISSED_PATH, {});
  const missed = process.argv.includes("--retry-missed") ? {} : recordedMissed;
  // Misses outside this run's stations stay recorded whatever this run finds.
  const inRun = new Set(csv.map((s) => s.id));
  const missedElsewhere = Object.fromEntries(
    Object.entries(recordedMissed).filter(([id]) => !inRun.has(id))
  );

  const kakaoKey = process.env.KAKAO_REST_API_KEY;
  const base: Geocoder = kakaoKey ? kakaoGeocoder(kakaoKey) : nominatimGeocoder();
  const geocode: Geocoder = async (station) =>
    missed[station.id] === station.address ? null : base(station);

  const toAsk = csv.filter(
    (s) => cache[s.id]?.address !== s.address && missed[s.id] !== s.address
  ).length;
  console.log(
    `CSV ${csv.length}곳, 저장된 좌표 ${csv.filter((s) => cache[s.id]?.address === s.address).length}곳, ` +
      `새로 물을 곳 ${toAsk}곳 (${kakaoKey ? "카카오" : "Nominatim, 초당 1회 이하"})`
  );

  const result = await buildDataset(csv, cache, geocode, {
    concurrency: kakaoKey ? 4 : 1,
    onProgress: (done, coords, unresolved) => {
      if (done % 50 === 0) {
        writeFileSync(COORDS_PATH, JSON.stringify({ ...cache, ...coords }));
        const missedSoFar = Object.fromEntries(unresolved.map((s) => [s.id, s.address]));
        writeFileSync(MISSED_PATH, JSON.stringify({ ...recordedMissed, ...missedSoFar }));
        console.log(`  ${done}/${toAsk}곳 처리, 못 찾음 ${unresolved.length}곳`);
      }
    },
  });

  const nowMissed = Object.fromEntries(result.unresolved.map((s) => [s.id, s.address]));
  const dataset: StationDataset = { priceDate: priceDate(), stations: result.stations };
  // With a region filter, keep what is cached for the other regions.
  writeFileSync(COORDS_PATH, JSON.stringify(region ? { ...cache, ...result.coords } : result.coords));
  writeFileSync(MISSED_PATH, JSON.stringify({ ...missedElsewhere, ...nowMissed }));
  writeFileSync(DATASET_PATH, JSON.stringify(dataset));

  console.log(`stations.json: ${result.stations.length}곳, 가격 기준일 ${dataset.priceDate}`);
  if (result.unresolved.length > 0) {
    console.log(`좌표를 찾지 못해 뺀 주유소 ${result.unresolved.length}곳 (station-coords-missed.json)`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
