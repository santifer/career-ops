import { icons } from "lucide-react";

type IconProps = {
  name: string;
  className?: string;
};

type IconType = React.ComponentType<React.SVGProps<SVGSVGElement>>;

type IconsType = {
  [key: string]: IconType;
};

const iconMap: IconsType = icons;

const Icon: React.FC<IconProps> = ({ name, className }) => {
  const LucideIcon = iconMap[name];

  if (!LucideIcon) {
    return null;
  }

  return <LucideIcon className={className} />;
};

export default Icon;
