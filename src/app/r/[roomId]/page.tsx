import { Header } from "@/components/header";
import { Room } from "@/components/room";

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <><Header /><Room key={roomId} roomId={roomId} /><footer className="site-footer">Good company is the best part of the plan.</footer></>;
}
