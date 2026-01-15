export const createSubscriber = <T>() => {
  type Handler = (value: T) => void;
  let handlers: Handler[] = [];

  const subscribe = (handler: Handler) => {
    handlers = [handler, ...handlers];
    return () => {
      handlers = handlers.filter(_ => _ !== handler);
    };
  };

  const emit = (value: T) => handlers.forEach(handler => handler(value));

  return {
    subscribe,
    emit,
  };
};

export type Subscriber = ReturnType<typeof createSubscriber>;
