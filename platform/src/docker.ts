import { request } from "node:http";

// A small client for the Docker Engine API over its Unix socket: just what
// creating and removing sites needs.

const SOCKET = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";

export class DockerError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request(
      {
        socketPath: SOCKET,
        method,
        path: `/v1.43${path}`,
        headers: {
          "Content-Type": "application/json",
          ...(payload && { "Content-Length": Buffer.byteLength(payload) }),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          if (status >= 400) {
            let message = data;
            try {
              message = JSON.parse(data).message ?? data;
            } catch {}
            reject(new DockerError(`${method} ${path}: ${message}`, status));
            return;
          }
          try {
            resolve((data ? JSON.parse(data) : null) as T);
          } catch {
            resolve(data as T);
          }
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export type ContainerSpec = {
  name: string;
  image: string;
  env: Record<string, string>;
  cmd?: string[];
  entrypoint?: string[];
  mounts: { volume: string; target: string; readOnly?: boolean }[];
  network: string;
  memoryMb?: number;
  restart?: boolean;
  labels?: Record<string, string>;
};

export async function createVolume(
  name: string,
  labels: Record<string, string> = {},
) {
  await call("POST", "/volumes/create", { Name: name, Labels: labels });
}

export async function removeVolume(name: string) {
  await call("DELETE", `/volumes/${encodeURIComponent(name)}?force=true`).catch(
    (e) => {
      if (!(e instanceof DockerError && e.status === 404)) throw e;
    },
  );
}

export async function createContainer(spec: ContainerSpec) {
  const created = await call<{ Id: string }>(
    "POST",
    `/containers/create?name=${encodeURIComponent(spec.name)}`,
    {
      Image: spec.image,
      Env: Object.entries(spec.env).map(([k, v]) => `${k}=${v}`),
      ...(spec.cmd && { Cmd: spec.cmd }),
      ...(spec.entrypoint && { Entrypoint: spec.entrypoint }),
      Labels: spec.labels ?? {},
      HostConfig: {
        Mounts: spec.mounts.map((m) => ({
          Type: "volume",
          Source: m.volume,
          Target: m.target,
          ReadOnly: !!m.readOnly,
        })),
        NetworkMode: spec.network,
        ...(spec.memoryMb && {
          Memory: spec.memoryMb * 1024 * 1024,
          MemorySwap: spec.memoryMb * 1024 * 1024,
        }),
        ...(spec.restart && { RestartPolicy: { Name: "unless-stopped" } }),
        // No new privileges, and only the capabilities a web server needs
        SecurityOpt: ["no-new-privileges"],
        CapDrop: ["ALL"],
        CapAdd: ["CHOWN", "SETUID", "SETGID", "DAC_OVERRIDE", "FOWNER"],
      },
    },
  );
  return created.Id;
}

export const startContainer = (name: string) =>
  call("POST", `/containers/${encodeURIComponent(name)}/start`);

export const restartContainer = (name: string) =>
  call("POST", `/containers/${encodeURIComponent(name)}/restart?t=10`);

export async function removeContainer(name: string) {
  await call(
    "DELETE",
    `/containers/${encodeURIComponent(name)}?force=true&v=false`,
  ).catch((e) => {
    if (!(e instanceof DockerError && e.status === 404)) throw e;
  });
}

/** Runs a container to completion and returns its exit code. */
export async function runToCompletion(spec: ContainerSpec) {
  await removeContainer(spec.name);
  await createContainer(spec);
  await startContainer(spec.name);
  const result = await call<{ StatusCode: number }>(
    "POST",
    `/containers/${encodeURIComponent(spec.name)}/wait`,
  );
  await removeContainer(spec.name);
  return result.StatusCode;
}
