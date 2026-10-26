"""Служебные команды для сервера (выполняются внутри контейнера бэкенда).

    docker exec -it shift_management_backend python -m app.cli reset-password <логин>
    docker exec -it shift_management_backend python -m app.cli list-admins

reset-password выдаёт временный пароль (сотрудник сменит его при входе) и закрывает все сессии.
Нужна, если единственный администратор забыл пароль.
"""
import argparse
import sys

from app.api.routes.users import generate_temporary_password
from app.core.security import get_password_hash
from app.db.init_db import create_tables
from app.db.migrations import run_migrations
from app.db.session import SessionLocal, engine
from app.models import User


def reset_password(username: str) -> int:
    with SessionLocal() as db:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            print(f"Пользователь «{username}» не найден. Логины администраторов: python -m app.cli list-admins")
            return 1
        temporary = generate_temporary_password()
        user.hashed_password = get_password_hash(temporary)
        user.must_change_password = True
        user.is_active = True
        user.revoke_sessions()
        db.commit()
        print(f"Временный пароль для «{username}»: {temporary}")
        print("При входе система попросит задать новый пароль. Все прежние сессии закрыты.")
    return 0


def list_admins() -> int:
    with SessionLocal() as db:
        for user in db.query(User).filter(User.is_admin.is_(True)).order_by(User.id):
            state = "активен" if user.is_active else "отключён"
            print(f"{user.username}\t{user.name}\t{state}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Служебные команды Shift Control")
    sub = parser.add_subparsers(dest="command", required=True)
    reset = sub.add_parser("reset-password", help="выдать временный пароль пользователю")
    reset.add_argument("username")
    sub.add_parser("list-admins", help="логины администраторов")
    args = parser.parse_args()

    create_tables(engine)
    with SessionLocal() as db:
        run_migrations(engine, db)

    if args.command == "reset-password":
        return reset_password(args.username)
    return list_admins()


if __name__ == "__main__":
    sys.exit(main())
