import React, { createContext, useContext, useEffect, useState } from "react";
import { createDockerDesktopClient } from "@docker/extension-api-client";

export interface NgrokContainer {
  id: string;
  ContainerId: string;
  Name: string;
  Port: DockerPort;
  
  // v2 Options
  tcp: boolean;
  http: boolean;
  oauth: string;
}

export interface DockerContainer {
  Id: string;
  Names: string[];
  Ports: DockerPort[];
}

export interface DockerPort {
  PublicPort: number;
  Type: string;
}

export interface Tunnel {
  ContainerID: string;
  URL: string;
}

const client = createDockerDesktopClient();

function useDockerDesktopClient() {
  return client;
}

interface IngrokContext {
  authtoken: string;
  setAuthToken: (authtoken: string) => void;

  containers: Record<string,NgrokContainer>;
  setContainers: (containers: Record<string, NgrokContainer>) => void;

  tunnels: Record<string,Tunnel>;
  setTunnels: (tunnels: Record<string, Tunnel>) => void;
}

const NgrokContext = createContext<IngrokContext>({
  authtoken: "",
  setAuthToken: () => null,
  containers: {},
  setContainers: () => null,
  tunnels: {},
  setTunnels: () => null,
});

export function NgrokContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [authtoken, setAuthToken] = useState(
    localStorage.getItem("authtoken") ?? ""
  );

  const [containers, setContainers] = useState(
    localStorage.getItem("containers") ? JSON.parse(localStorage.getItem("containers") ?? "") : {}
  );

  const [tunnels, setTunnels] = useState(
    localStorage.getItem("tunnels") ? JSON.parse(localStorage.getItem("tunnels") ?? "") : {}
  );

  const getContainers = async () => {
    ddClient.docker.listContainers().then((loaded)=>{
      updateContainers(loaded as DockerContainer[]);
    });

    ddClient.extension.vm?.service?.get("/progress").then((result)=>{
      updateTunnels(result as Record<string, Tunnel>);
    });
  }

  function updateContainers(loaded: DockerContainer[]) {
    if(loaded){
      const newContainers: Record<string, NgrokContainer> = {};
      for(const container of loaded){
        for(const port of container.Ports.filter(x=>x.PublicPort)){
          const container_id = `${container.Id}:${port.PublicPort}`;
          if(!containers[container_id]){
            newContainers[container_id] = {
              id: container_id,
              ContainerId: container.Id,
              Name: container.Names[0].substring(1),
              Port: port,
              tcp: false,
              http: true,
              oauth: "",
            };
          }else{
            newContainers[container_id] = containers[container_id];
            if(newContainers[container_id].Name !== container.Names[0].substring(1,)){
              newContainers[container_id].Name = container.Names[0].substring(1);
            }
            if(newContainers[container_id].Port.PublicPort !== port.PublicPort){
              newContainers[container_id].Port = port;
            }
          }
        }
      }
  
      setContainers(newContainers);
      localStorage.setItem("containers", JSON.stringify(newContainers));
    }
  }
  
  function updateTunnels(loaded: Record<string, Tunnel>) {
    setTunnels(loaded);
    localStorage.setItem("tunnels", JSON.stringify(loaded));
  }

  const ddClient = useDockerDesktopClient();
  useEffect(() => {
    ddClient.extension.vm?.service
      ?.get(`/auth?token=${authtoken}`)
      .then((result) => {
        localStorage.setItem("authtoken", authtoken);
      });
    
      getContainers();
    
  }, [authtoken]);

  useEffect(() => {
    // If the auth token already exists in the local storage, make a GET /auth request automatically to set up the auth
    if (authtoken !== null) {
      ddClient.extension.vm?.service?.get(`/auth?token=${authtoken}`);

      getContainers();
    }
  }, []);

  useEffect(() => {
    const containersEvents = async () => {
      await ddClient.docker.cli.exec(
        "events",
        [
          "--format",
          `"{{ json . }}"`,
          "--filter",
          "type=container",
          "--filter",
          "event=start",
          "--filter",
          "event=destroy",
        ],
        {
          stream: {
            async onOutput(data: any) {
              await getContainers();
            },
            onClose(exitCode) {
              console.log("onClose with exit code " + exitCode);
            },
            splitOutputLines: true,
          },
        }
      );
    };

    containersEvents();
  }, []);

  return (
    <NgrokContext.Provider
      value={{
        authtoken,
        setAuthToken,
        containers,
        setContainers,
        tunnels,
        setTunnels,
      }}
    >
      {children}
    </NgrokContext.Provider>
  );
}

export function useNgrokContext() {
  return useContext(NgrokContext);
}
