{
  description = "Node.js 24 + PostgreSQL 17 Dev Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    utils,
  }:
    utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {inherit system;};
    in {
      devShells.default = pkgs.mkShell {
        buildInputs = with pkgs; [
          # Core Runtimes
          nodejs_24
          pnpm

          # Database Client & Infrastructure
          postgresql_17
          podman
          podman-compose

          # Automation
          gnumake

          # Utilities
          poppler-utils
        ];

        shellHook = ''
          echo "--- Node.js 24 / PostgreSQL 17 Dev Environment ---"
          node --version
          pnpm --version
          psql --version

          # Optional: Alias docker-compose to podman-compose
          alias docker-compose='podman-compose'
        '';
      };
    });
}
