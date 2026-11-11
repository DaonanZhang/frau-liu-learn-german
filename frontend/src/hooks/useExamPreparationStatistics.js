import { useEffect, useState } from "react";

import { fetchExamPreparationStatistics } from "../api/exam_preparation/statistics.js";

export function useExamPreparationStatistics() {
  const [levels, setLevels] = useState(null);

  useEffect(() => {
    let mounted = true;

    fetchExamPreparationStatistics()
      .then((statistics) => {
        if (mounted) {
          setLevels(statistics.levels);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  return levels;
}
