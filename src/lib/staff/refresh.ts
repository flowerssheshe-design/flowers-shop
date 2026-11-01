"use client";

// One "רענון" button in every staff page header reloads all the data on the
// page: it fires this event and every data hook on the page reloads.

import { useEffect, useRef } from "react";

export const STAFF_REFRESH_EVENT = "staff:refresh";

export function requestStaffRefresh() {
  window.dispatchEvent(new Event(STAFF_REFRESH_EVENT));
}

/** Calls `reload` whenever the page's refresh button is pressed. */
export function useStaffRefresh(reload: () => unknown) {
  const ref = useRef(reload);
  ref.current = reload;
  useEffect(() => {
    const handler = () => void ref.current();
    window.addEventListener(STAFF_REFRESH_EVENT, handler);
    return () => window.removeEventListener(STAFF_REFRESH_EVENT, handler);
  }, []);
}
