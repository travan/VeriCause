const listenMock = jest.fn();
const closeMock = jest.fn(async () => undefined);
const createMock = jest.fn(async () => ({
  listen: listenMock,
  close: closeMock,
}));

jest.mock("@nestjs/core", () => ({
  NestFactory: {
    create: createMock,
  },
}));

describe("server bootstrap", () => {
  beforeEach(() => {
    listenMock.mockReset();
    closeMock.mockReset();
    createMock.mockClear();
    delete process.env.PORT;
  });

  it("boots the Nest server on the configured port", async () => {
    process.env.PORT = "4010";
    const { bootstrap } = await import("../../src/server/main");

    await bootstrap();

    expect(createMock).toHaveBeenCalled();
    expect(listenMock).toHaveBeenCalledWith(4010);
  });

  it("registers SIGTERM and SIGINT handlers that close the app", async () => {
    const processSpy = jest.spyOn(process, "on");
    const { bootstrap } = await import("../../src/server/main");

    await bootstrap();

    const sigtermCall = processSpy.mock.calls.find(([event]) => event === "SIGTERM");
    const sigintCall = processSpy.mock.calls.find(([event]) => event === "SIGINT");

    expect(sigtermCall).toBeDefined();
    expect(sigintCall).toBeDefined();

    // Invoke the registered handler and verify it calls app.close()
    const handler = sigtermCall![1] as () => void;
    handler();
    await Promise.resolve();

    expect(closeMock).toHaveBeenCalled();
    processSpy.mockRestore();
  });
});
