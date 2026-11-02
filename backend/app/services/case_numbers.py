"""Номер кейса из названия: «CASE#1750882 Arctic Vostok» → 1750882, «392923 Gustav» → 392923."""
import re
from typing import Callable, Iterable, List, Optional, TypeVar

_CASE_RE = re.compile(r"CASE\s*#\s*(\d+)", re.I)
# Без «CASE#» — первое отдельное число из 3+ цифр (номер change-запроса и т.п.)
_NUMBER_RE = re.compile(r"(?<!\d)(\d{3,})(?!\d)")

T = TypeVar("T")


def case_number(title: Optional[str]) -> Optional[int]:
    if not title:
        return None
    match = _CASE_RE.search(title) or _NUMBER_RE.search(title)
    return int(match.group(1)) if match else None


def by_case_number(items: Iterable[T], title: Callable[[T], str], descending: bool = False) -> List[T]:
    """Сортировка по номеру; кейсы без номера — в конце при любом направлении, по названию."""
    items = list(items)
    numbered = [i for i in items if case_number(title(i)) is not None]
    rest = [i for i in items if case_number(title(i)) is None]
    numbered.sort(key=lambda i: case_number(title(i)), reverse=descending)
    rest.sort(key=lambda i: title(i).casefold())
    return numbered + rest
