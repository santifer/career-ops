{
  description = "career-ops - AI job search pipeline";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flakelight.url = "github:nix-community/flakelight";
  };

  outputs =
    { flakelight, nixpkgs, ... }:
    flakelight ./. {

      inputs.nixpkgs = nixpkgs;

      devShell.packages =
        pkgs: with pkgs; [

          nodejs
          bun

          coreutils

          playwright-driver.browsers

        ];

      devShell.env = pkgs: {
        PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
        PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
      };

    };

}
