#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Скрипт для просмотра содержимого базы данных shifts.db
Используйте: python view_database.py [путь_к_БД]
По умолчанию открывается backend/data/shifts.db (там её создаёт бэкенд при локальном запуске).
"""

import sqlite3
import os
import sys
from datetime import datetime

# Консоль Windows (cp1251) не умеет печатать эмодзи — без этого скрипт падал при выводе в файл/pipe
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DB_PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join("backend", "data", "shifts.db")

def connect_to_db():
    """Подключение к базе данных"""
    db_path = DB_PATH
    if not os.path.exists(db_path):
        print(f"❌ Файл базы данных не найден: {db_path}")
        return None
    
    try:
        conn = sqlite3.connect(db_path)
        print(f"✅ Подключение к базе данных: {db_path}")
        return conn
    except Exception as e:
        print(f"❌ Ошибка подключения к базе: {e}")
        return None

def show_tables(conn):
    """Показать список всех таблиц"""
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    
    print("\n📋 Таблицы в базе данных:")
    for table in tables:
        print(f"  - {table[0]}")
    
    return [table[0] for table in tables]

def show_table_info(conn, table_name):
    """Показать информацию о таблице"""
    cursor = conn.cursor()
    
    # Получаем количество записей
    cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
    count = cursor.fetchone()[0]
    
    # Получаем структуру таблицы
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = cursor.fetchall()
    
    print(f"\n📊 Таблица '{table_name}' ({count} записей):")
    print("   Колонки:")
    for col in columns:
        print(f"     - {col[1]} ({col[2]})")
    
    return count

def show_recent_data(conn, table_name, limit=5):
    """Показать последние записи из таблицы"""
    cursor = conn.cursor()
    
    try:
        cursor.execute(f"SELECT * FROM {table_name} ORDER BY id DESC LIMIT {limit}")
        rows = cursor.fetchall()
        
        # Получаем названия колонок
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = [col[1] for col in cursor.fetchall()]
        
        if rows:
            print(f"\n📋 Последние {min(len(rows), limit)} записей из '{table_name}':")
            for i, row in enumerate(rows, 1):
                print(f"\n   Запись {i}:")
                for j, value in enumerate(row):
                    # Ограничиваем длину текста для читаемости
                    if isinstance(value, str) and len(value) > 50:
                        value = value[:50] + "..."
                    print(f"     {columns[j]}: {value}")
        else:
            print(f"\n📋 Таблица '{table_name}' пуста")
            
    except Exception as e:
        print(f"❌ Ошибка чтения таблицы {table_name}: {e}")

def get_database_size():
    """Получить размер базы данных"""
    db_path = DB_PATH
    if os.path.exists(db_path):
        size = os.path.getsize(db_path)
        if size < 1024:
            return f"{size} байт"
        elif size < 1024*1024:
            return f"{size/1024:.1f} КБ"
        else:
            return f"{size/(1024*1024):.1f} МБ"
    return "Неизвестно"

def main():
    print("🗄️  ПРОСМОТР БАЗЫ ДАННЫХ СИСТЕМЫ ПЕРЕДАЧ СМЕН")
    print("=" * 50)
    
    # Информация о файле
    db_size = get_database_size()
    print(f"📁 Размер базы данных: {db_size}")
    print(f"🕐 Время: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Подключение
    conn = connect_to_db()
    if not conn:
        return
    
    try:
        # Показать все таблицы
        tables = show_tables(conn)
        
        # Показать информацию о каждой таблице
        for table in tables:
            count = show_table_info(conn, table)
            if count > 0:
                show_recent_data(conn, table)
        
        print("\n" + "=" * 50)
        print("✅ Просмотр завершен!")
        print("\n💡 Для экспорта данных используйте кнопку 'Экспорт' в веб-интерфейсе")
        print("💡 Для полной очистки используйте кнопку 'Очистить' в веб-интерфейсе")
        
    finally:
        conn.close()

if __name__ == "__main__":
    main()
