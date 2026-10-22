import { StationFinder } from "@/features/stations/station-finder";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto flex w-full max-w-xl flex-col">
        <StationFinder />
      </div>
    </main>
  );
}
