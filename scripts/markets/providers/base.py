"""Base market data provider interface and common utilities."""
from __future__ import annotations

import abc
import random
import time
from typing import Any, Callable, TypeVar

T = TypeVar("T")


def retry_with_backoff(
    func: Callable[[], T],
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 15.0,
    jitter: bool = True,
    retryable_exceptions: tuple[type[Exception], ...] = (Exception,),
) -> T:
    """Execute a callable with bounded exponential backoff and jitter."""
    attempt = 0
    while True:
        try:
            return func()
        except retryable_exceptions as exc:
            attempt += 1
            if attempt > max_retries:
                raise exc
            delay = min(base_delay * (2 ** (attempt - 1)), max_delay)
            if jitter:
                delay = delay * (0.5 + random.random())
            time.sleep(delay)


class BaseProvider(abc.ABC):
    """Abstract interface for upstream financial market data providers."""

    name: str = "base"
    price_basis: str = "exchange-close"  # 'adjusted-close' | 'exchange-close'

    @abc.abstractmethod
    def fetch_history(
        self,
        symbol: str,
        start_ts: int,
        end_ts: int,
        interval: str = "1d",
    ) -> list[dict[str, Any]]:
        """Fetch historical close price observations between start_ts and end_ts.

        Returns list of normalized observations: [{'t': int, 'c': float}, ...]
        sorted ascending by timestamp without duplicates.
        """
        raise NotImplementedError

    @abc.abstractmethod
    def fetch_batch_quotes(self, symbols: list[str]) -> dict[str, float]:
        """Fetch current indicative prices for a batch of symbols.

        Returns mapping of symbol -> current price.
        """
        raise NotImplementedError
