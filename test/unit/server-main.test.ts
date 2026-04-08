const listenMock = jest.fn();
const createMock = jest.fn(async () => ({
  listen: listenMock,
}));

jest.mock("@nestjs/core", () => ({
  NestFactory: {
    create: createMock,
  },
}));

describe("server bootstrap", () => {
  beforeEach(() => {
    listenMock.mockReset();
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
});
