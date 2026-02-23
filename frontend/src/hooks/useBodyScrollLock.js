import { useEffect } from "react";

let lockCount = 0;
let savedScrollY = 0;

export default function useBodyScrollLock(locked) {
  useEffect(() => {
    if (!locked) {
      return;
    }

    const body = document.body;
    lockCount += 1;

    if (lockCount === 1) {
      savedScrollY = window.scrollY || window.pageYOffset || 0;
      body.style.position = "fixed";
      body.style.top = `-${savedScrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
      body.style.overscrollBehavior = "contain";
    }

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount !== 0) {
        return;
      }

      const rawTop = body.style.top;
      const nextScroll = rawTop ? -parseInt(rawTop, 10) : savedScrollY;

      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.width = "";
      body.style.overflow = "";
      body.style.overscrollBehavior = "";

      window.scrollTo(0, Number.isFinite(nextScroll) ? nextScroll : 0);
    };
  }, [locked]);
}
