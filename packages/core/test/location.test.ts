import { describe, expect, it } from "vitest";
import { locationAt, nearestCity, parseLatLng, readLocationInput, roundCoord } from "../src/index.js";

describe("parseLatLng", () => {
  it("reads Google Maps links", () => {
    expect(parseLatLng("https://www.google.com/maps/@37.3318,-121.8916,15z")).toEqual({ lat: 37.3318, lng: -121.8916 });
    expect(parseLatLng("https://www.google.com/maps/place/X/data=!3d40.7128!4d-74.006")).toEqual({
      lat: 40.7128,
      lng: -74.006,
    });
    expect(parseLatLng("https://maps.google.com/?q=41.4993,-81.6944")).toEqual({ lat: 41.4993, lng: -81.6944 });
    expect(parseLatLng("https://www.google.com/maps/search/?api=1&query=41.5%2C-81.7")).toEqual({
      lat: 41.5,
      lng: -81.7,
    });
  });

  it("reads typed coordinates", () => {
    expect(parseLatLng(" 37.33 , -121.89 ")).toEqual({ lat: 37.33, lng: -121.89 });
  });

  it("refuses text and out-of-range numbers", () => {
    expect(parseLatLng("San Jose")).toBeNull();
    expect(parseLatLng("95.1, 10")).toBeNull();
    expect(parseLatLng("10, 190")).toBeNull();
  });
});

describe("nearestCity", () => {
  it("names a city within 60 miles", () => {
    expect(nearestCity(37.39, -122.08)).toBe("San Jose, CA");
  });

  it("falls back to coordinates far from any city", () => {
    expect(nearestCity(64.2, -149.5)).toBe("64.20, -149.50");
  });
});

describe("locationAt", () => {
  it("rounds to about 10 m and labels with the nearest city", () => {
    expect(locationAt(41.499312, -81.694361)).toEqual({ label: "Cleveland, OH", lat: 41.4993, lng: -81.6944 });
    expect(roundCoord(1.234567)).toBe(1.2346);
  });
});

describe("readLocationInput", () => {
  it("takes a known city", () => {
    expect(readLocationInput("boston")).toEqual({ location: { label: "Boston, MA", lat: 42.3601, lng: -71.0589 } });
  });

  it("takes a Maps link or coordinates", () => {
    expect(readLocationInput("https://www.google.com/maps/@40.7128,-74.006,12z").location?.label).toBe("New York, NY");
    expect(readLocationInput("35.6762, 139.6503").location).toEqual({
      label: "Tokyo, Japan",
      lat: 35.6762,
      lng: 139.6503,
    });
  });

  it("explains what's wrong", () => {
    expect(readLocationInput("  ").error).toMatch(/Type a city/);
    expect(readLocationInput("https://maps.app.goo.gl/abc").error).toMatch(/no coordinates/);
    expect(readLocationInput("Atlantis").error).toMatch(/doesn't know "Atlantis"/);
  });
});
