import React from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import Button from './Button';
import EmptyState from './EmptyState';

interface PageErrorBoundaryProps {
  children: React.ReactNode;
}

interface PageErrorBoundaryState {
  error: Error | null;
}

/** Если страница не загрузилась (нет связи с сервером, вышло обновление) — показываем понятное сообщение вместо белого экрана. */
class PageErrorBoundary extends React.Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  state: PageErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PageErrorBoundaryState {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card">
        <EmptyState
          icon={WifiOff}
          title="Не удалось загрузить страницу"
          description="Проверьте связь с сервером. Если сайт только что обновили — перезагрузите страницу."
          action={
            <Button icon={RefreshCw} onClick={() => window.location.reload()}>
              Обновить
            </Button>
          }
        />
      </div>
    );
  }
}

export default PageErrorBoundary;
