"""
Rank fallback policy for the room allocator.
"""

from __future__ import annotations

from typing import Dict, Iterable, List

from config import normalize_rank


class RankPolicy:
    """
    Rank fallback policy.

    Rules:
      - VP: ["VP"] only (no downgrade)
      - Director: ["Director", "Manager", "Junior"]
      - Manager: ["Manager", "Junior"]
      - Junior: ["Junior"]
    """

    def __init__(self, ranks_high_to_low: Iterable[str]) -> None:
        """
        Args:
            ranks_high_to_low: Rank names ordered from highest to lowest.

        Returns:
            None

        Raises:
            ValueError: If empty or duplicates exist.
        """
        ranks = [normalize_rank(r) for r in ranks_high_to_low]
        if not ranks:
            raise ValueError("RankPolicy must have at least one rank.")
        if len(set(ranks)) != len(ranks):
            raise ValueError("RankPolicy ranks must be unique.")
        self._allowed = set(ranks)
        self._chains: Dict[str, List[str]] = {
            ranks[0]: [ranks[0]],
            **{ranks[i]: ranks[i:] for i in range(1, len(ranks))},
        }

    def validate_rank(self, rank: str) -> None:
        """
        Args:
            rank: Rank string.

        Returns:
            None

        Raises:
            ValueError: If rank is not allowed.
        """
        if rank not in self._allowed:
            raise ValueError(f"Invalid rank '{rank}'. Allowed: {sorted(self._allowed)}")

    def chain(self, rank: str) -> List[str]:
        """
        Args:
            rank: Rank string.

        Returns:
            List of ranks to try in order.

        Raises:
            ValueError: If rank is invalid.
        """
        self.validate_rank(rank)
        return list(self._chains.get(rank, [rank]))
