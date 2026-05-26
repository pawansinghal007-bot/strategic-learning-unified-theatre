export {};

declare global {
  interface Window {
    rotator: {
      accounts: {
        list(): Promise<unknown>;
        listDetails(): Promise<unknown>;
        info(id: string): Promise<unknown>;
        add(account: unknown): Promise<unknown>;
        capture(payload: unknown): Promise<unknown>;
        update(id: string, patch: unknown): Promise<unknown>;
        remove(id: string): Promise<unknown>;
        health(id: string): Promise<unknown>;
      };
      switcher: {
        switch(id: string): Promise<unknown>;
      };
      daemon: {
        status(): Promise<unknown>;
        pause(): Promise<unknown>;
        resume(): Promise<unknown>;
        onEvent(handler: (event: unknown) => void): void;
        offEvent(handler: (event: unknown) => void): void;
      };
      git: {
        status(path?: string): Promise<unknown>;
        watchedRepos(): Promise<unknown>;
        addRepo(path: string): Promise<unknown>;
        removeRepo(path: string): Promise<unknown>;
        pickDir(): Promise<unknown>;
      };
      journal: {
        tail(count?: number): Promise<unknown>;
        rawMd(): Promise<unknown>;
      };
      config: {
        get(): Promise<unknown>;
        set(patch: unknown): Promise<unknown>;
      };
      llm: {
        status(): Promise<unknown>;
        setup(opts?: unknown): Promise<unknown>;
        ask(opts: unknown): Promise<unknown>;
      };
      browser: {
        send(opts: unknown): Promise<unknown>;
        login(opts?: unknown): Promise<unknown>;
        listResponses(opts?: unknown): Promise<unknown>;
        getResponse(filename: string): Promise<unknown>;
        clearResponses(opts?: unknown): Promise<unknown>;
        listPrompts(): Promise<unknown>;
        addPrompt(prompt: unknown): Promise<unknown>;
        updatePrompt(id: string, updates: unknown): Promise<unknown>;
        deletePrompt(id: string): Promise<unknown>;
        runPrompt(opts: unknown): Promise<unknown>;
        switchPlatform(name: string): Promise<unknown>;
        navigate(url: string): Promise<unknown>;
        setVisible(visible: boolean): Promise<unknown>;
        onCapture(handler: (payload: unknown) => void): void;
        offCapture(handler: (payload: unknown) => void): void;
        onNavigation(handler: (payload: unknown) => void): void;
        offNavigation(handler: (payload: unknown) => void): void;
      };
      robot: {
        runSuite(opts?: unknown): Promise<unknown>;
        runFile(filePath: string, opts?: unknown): Promise<unknown>;
        listFiles(): Promise<unknown>;
        readFile(filePath: string): Promise<unknown>;
        openFile(filePath: string): Promise<unknown>;
        tddCheck(opts?: unknown): Promise<unknown>;
        generateSkeleton(filePath: string): Promise<unknown>;
        pickSourceFile(): Promise<unknown>;
        pickRobotFile(): Promise<unknown>;
      };
      app: {
        version(): Promise<unknown>;
        openUrl(url: string): Promise<unknown>;
      };
      health: {
        aggregate(): Promise<import('../../../src/health').SystemHealth>;
      };
      logs: {
        onEvent(handler: (entry: unknown) => void): () => void;
      };
      captureResponse(payload: { responsePath: string }): Promise<unknown>;
      trayCommand(payload: { command: string }): Promise<unknown>;
      logView(payload: unknown): Promise<unknown>;
      robotRunnerAction(payload: { action: string }): Promise<unknown>;
    };
  }
}
