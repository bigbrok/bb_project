import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import Home from "@/app/page";

test("홈 화면은 근처 최저가 주유소 찾기를 보여준다", () => {
  vi.stubGlobal("navigator", {
    ...navigator,
    geolocation: { getCurrentPosition: vi.fn() },
  });

  render(<Home />);

  expect(
    screen.getByRole("heading", { level: 1, name: "근처 최저가 주유소" })
  ).toBeInTheDocument();

  vi.unstubAllGlobals();
});
