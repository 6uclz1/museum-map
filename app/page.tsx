// app/page.tsx

"use client"; // クライアントコンポーネントとして指定

import React, { useState, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic'; // dynamic import のため
import 'leaflet/dist/leaflet.css'; // Leaflet の CSS
import type { LatLngExpression } from 'leaflet'; // Leaflet の型のみインポート
import type L from 'leaflet'; // Leaflet の L オブジェクトの型をインポート

// shadcn/ui コンポーネントのインポート
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon } from "lucide-react"; // アイコン
import { format } from "date-fns"; // 日付フォーマット用
import { cn } from "@/lib/utils"; // shadcn/ui のユーティリティ

// --- 地図コンポーネントを dynamic import ---
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });

// --- 型定義 ---
interface Exhibition {
    id: string;
    name: string;
    date: string; // YYYY-MM-DD形式
    memo?: string;
}

interface Museum {
    id: string;
    name: string;
    lat: number;
    lng: number;
    exhibitions: Exhibition[];
}

// --- メインコンポーネント ---
export default function HomePage() {
    // --- 状態管理 ---
    const leafletRef = useRef<typeof import('leaflet') | null>(null); // Leaflet モジュール参照用
    const [isLeafletReady, setIsLeafletReady] = useState(false); // Leaflet準備完了フラグ

    const [museums, setMuseums] = useState<Museum[]>([]);
    const [selectedMuseumId, setSelectedMuseumId] = useState<string | null>(null);
    const [mapCenter, setMapCenter] = useState<LatLngExpression>([35.681236, 139.767125]);
    const [mapZoom, setMapZoom] = useState<number>(10);

    const [isAddMuseumDialogOpen, setIsAddMuseumDialogOpen] = useState(false);
    const [isAddExhibitionDialogOpen, setIsAddExhibitionDialogOpen] = useState(false);

    const [newMuseumName, setNewMuseumName] = useState('');
    const [newMuseumLat, setNewMuseumLat] = useState('');
    const [newMuseumLng, setNewMuseumLng] = useState('');

    const [newExhibitionName, setNewExhibitionName] = useState('');
    const [newExhibitionDate, setNewExhibitionDate] = useState<Date | undefined>(undefined);
    const [newExhibitionMemo, setNewExhibitionMemo] = useState('');

    // --- JSONファイルのインポート・エクスポート用ヘルパー関数 ---
    const exportMuseumsToFile = () => {
        const dataStr = JSON.stringify(museums, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "museums.json";
        link.click();
        URL.revokeObjectURL(url);
    };

    const importMuseumsFromFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const result = event.target?.result;
                if (typeof result === "string") {
                    const importedMuseums = JSON.parse(result);
                    if (Array.isArray(importedMuseums)) {
                        setMuseums(importedMuseums);
                         setSelectedMuseumId(null); // インポート後は選択解除
                    } else {
                        alert("無効なデータ形式です。");
                    }
                }
            } catch (error) {
                console.error("Failed to import museums from file:", error);
                alert("ファイルの読み込みに失敗しました。");
            }
        };
        reader.readAsText(file);
    };

    // --- クライアントサイドでの初期化処理 ---
    useEffect(() => {
        import('leaflet').then(L => {
            leafletRef.current = L;
            // Default icon paths (needed for popups, etc., even with DivIcon)
            delete (L.Icon.Default.prototype as any)._getIconUrl;
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
                iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
                shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
            });
            console.log("Leaflet library and default icons initialized.");
            setIsLeafletReady(true);
        }).catch(error => {
            console.error("Failed to load Leaflet dynamically:", error);
        });

        const storedMuseums = localStorage.getItem('visitedMuseums');
        if (storedMuseums) {
            try {
                const parsedMuseums = JSON.parse(storedMuseums);
                 if (Array.isArray(parsedMuseums)) {
                    setMuseums(parsedMuseums);
                 } else {
                     console.warn("Invalid data format found in localStorage for visitedMuseums.");
                     localStorage.removeItem('visitedMuseums');
                 }
            } catch (error) {
                console.error("Failed to parse visitedMuseums from localStorage:", error);
                localStorage.removeItem('visitedMuseums');
            }
        }
    }, []);

    // --- ローカルストレージへの保存 ---
    useEffect(() => {
        if (museums.length > 0 || localStorage.getItem('visitedMuseums') !== null) {
             try {
                 localStorage.setItem('visitedMuseums', JSON.stringify(museums));
             } catch (error) {
                 console.error("Failed to save museums to localStorage:", error);
             }
        }
    }, [museums]);

    // --- ★ 訪問回数に応じたアイコンを生成する関数 ---
    const getMarkerIcon = (visitCount: number): L.DivIcon | L.Icon | undefined => {
        const L = leafletRef.current;
        if (!L) return undefined; // Leaflet が準備できていなければ何もしない

        let iconHtml: string;
        let iconClassName = 'custom-div-icon '; // ベースクラス

        // 訪問回数に応じてクラスと表示内容を決定
        if (visitCount === 0) {
            iconClassName += 'marker-gray';
            iconHtml = `<div>0</div>`;
        } else if (visitCount <= 2) {
            iconClassName += 'marker-blue';
            iconHtml = `<div>${visitCount}</div>`;
        } else if (visitCount <= 5) {
            iconClassName += 'marker-green';
            iconHtml = `<div>${visitCount}</div>`;
        } else { // 6回以上
            iconClassName += 'marker-red';
            iconHtml = `<div>${visitCount}</div>`;
        }

        return new L.DivIcon({
            html: iconHtml,
            className: iconClassName,
            iconSize: [28, 28],     // アイコンのサイズ [width, height]
            iconAnchor: [14, 28],   // アイコンのどの点が座標に一致するか [中心x, 下端y]
            popupAnchor: [0, -28]   // ポップアップがアイコンのどこから開くか [x, y]
        });
    };


    // --- イベントハンドラ ---
    const handleMarkerClick = (museumId: string) => {
        setSelectedMuseumId(museumId);
        const museum = museums.find(m => m.id === museumId);
        if (museum) {
            setMapCenter([museum.lat, museum.lng]);
            // setMapZoom(15); // 必要ならズーム変更
        }
    };

    const handleAddMuseum = () => {
        const lat = parseFloat(newMuseumLat);
        const lng = parseFloat(newMuseumLng);
        if (!newMuseumName.trim() || isNaN(lat) || isNaN(lng)) {
            alert('有効な美術館名、緯度、経度を入力してください。');
            return;
        }
        const newMuseum: Museum = {
            id: crypto.randomUUID(),
            name: newMuseumName.trim(),
            lat: lat,
            lng: lng,
            exhibitions: [],
        };
        setMuseums(prevMuseums => [...prevMuseums, newMuseum]);
        setNewMuseumName('');
        setNewMuseumLat('');
        setNewMuseumLng('');
        setIsAddMuseumDialogOpen(false);
        setSelectedMuseumId(newMuseum.id);
        setMapCenter([lat, lng]);
    };

    const handleAddExhibition = () => {
        if (!selectedMuseumId) {
            alert('展覧会を追加する美術館が選択されていません。');
            return;
        }
        if (!newExhibitionName.trim() || !newExhibitionDate) {
            alert('展覧会名と訪問日を入力してください。');
            return;
        }
        const newExhibition: Exhibition = {
            id: crypto.randomUUID(),
            name: newExhibitionName.trim(),
            date: format(newExhibitionDate, 'yyyy-MM-dd'),
            memo: newExhibitionMemo.trim(),
        };
        setMuseums(prevMuseums =>
            prevMuseums.map(museum =>
                museum.id === selectedMuseumId
                    ? {
                        ...museum,
                        exhibitions: [...museum.exhibitions, newExhibition].sort((a, b) => b.date.localeCompare(a.date))
                      }
                    : museum
            )
        );
        setNewExhibitionName('');
        setNewExhibitionDate(undefined);
        setNewExhibitionMemo('');
        setIsAddExhibitionDialogOpen(false);
    };

    // --- 選択中の美術館情報を計算 ---
    const selectedMuseum = useMemo(() => {
        return museums.find(m => m.id === selectedMuseumId);
    }, [museums, selectedMuseumId]);

    // --- レンダリング ---
    return (
        <div className="flex flex-col md:flex-row h-screen bg-background text-foreground overflow-hidden">

            {/* =============== 左側: 地図エリア =============== */}
            <div className="w-full md:w-1/2 h-1/2 md:h-full relative">
                {isLeafletReady ? (
                    <MapContainer
                        center={mapCenter}
                        zoom={mapZoom}
                        style={{ height: '100%', width: '100%' }}
                        className='z-0'
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        {/* ★ マーカー生成部分を変更 */}
                        {museums.map(museum => {
                            const visitCount = museum.exhibitions.length;
                            const icon = getMarkerIcon(visitCount); // カスタムアイコンを取得

                            // iconが取得できた場合のみMarkerを表示
                            return icon ? (
                                <Marker
                                    key={museum.id}
                                    position={[museum.lat, museum.lng]}
                                    icon={icon} // ★ カスタムアイコンを設定
                                    eventHandlers={{
                                        click: () => handleMarkerClick(museum.id),
                                    }}
                                >
                                    {/* ★ ポップアップに訪問回数を追加 */}
                                    <Popup>{museum.name}<br/>訪問回数: {visitCount}回</Popup>
                                </Marker>
                            ) : null; // iconがなければ何も表示しない (Leaflet準備中など)
                        })}
                    </MapContainer>
                 ) : (
                     <div className="flex justify-center items-center h-full bg-muted">
                        <p className="text-muted-foreground animate-pulse">地図を読み込み中...</p>
                     </div>
                 )}

                 {/* --- 美術館追加ボタン & ダイアログ --- */}
                 <div className="absolute top-3 right-3 z-10">
                     <Dialog open={isAddMuseumDialogOpen} onOpenChange={setIsAddMuseumDialogOpen}>
                         <DialogTrigger asChild>
                             <Button variant="secondary" size="sm">美術館を追加</Button>
                         </DialogTrigger>
                         <DialogContent className="sm:max-w-[480px]">
                             <DialogHeader>
                                 <DialogTitle>新しい美術館を追加</DialogTitle>
                                 <DialogDescription>
                                     訪問した美術館の情報を入力してください。緯度・経度は<a href="https://www.geocoding.jp/" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">ジオコーディングサイト</a>などで調べられます。
                                 </DialogDescription>
                             </DialogHeader>
                             <div className="grid gap-4 py-4">
                                 <div className="grid grid-cols-4 items-center gap-4">
                                     <Label htmlFor="museum-name" className="text-right">
                                         美術館名 <span className="text-destructive">*</span>
                                     </Label>
                                     <Input id="museum-name" value={newMuseumName} onChange={(e) => setNewMuseumName(e.target.value)} className="col-span-3" required />
                                 </div>
                                 <div className="grid grid-cols-4 items-center gap-4">
                                     <Label htmlFor="museum-lat" className="text-right">
                                         緯度 <span className="text-destructive">*</span>
                                     </Label>
                                     <Input id="museum-lat" type="number" step="any" value={newMuseumLat} onChange={(e) => setNewMuseumLat(e.target.value)} className="col-span-3" placeholder="例: 35.681236" required />
                                 </div>
                                 <div className="grid grid-cols-4 items-center gap-4">
                                     <Label htmlFor="museum-lng" className="text-right">
                                         経度 <span className="text-destructive">*</span>
                                     </Label>
                                     <Input id="museum-lng" type="number" step="any" value={newMuseumLng} onChange={(e) => setNewMuseumLng(e.target.value)} className="col-span-3" placeholder="例: 139.767125" required />
                                 </div>
                             </div>
                             <DialogFooter>
                                 <Button type="button" variant="outline" onClick={() => setIsAddMuseumDialogOpen(false)}>キャンセル</Button>
                                 <Button type="button" onClick={handleAddMuseum}>保存</Button>
                             </DialogFooter>
                         </DialogContent>
                     </Dialog>
                 </div>

                 {/* --- インポート・エクスポートボタン --- */}
                 <div className="absolute bottom-3 right-3 z-10 flex space-x-2">
                     <Button type="button" variant="secondary" size="sm" onClick={exportMuseumsToFile}>
                         データをエクスポート
                     </Button>
                     <label htmlFor="import-museums" className="cursor-pointer">
                         <Button type="button" variant="secondary" size="sm" asChild>
                             <span>データをインポート</span>
                         </Button>
                         <input
                             id="import-museums"
                             type="file"
                             accept="application/json"
                             className="hidden"
                             onChange={(e) => {
                                 const file = e.target.files?.[0];
                                 if (file) importMuseumsFromFile(file);
                                 e.target.value = ''; // 同じファイルを選択できるように値をリセット
                             }}
                         />
                     </label>
                 </div>
            </div>

            {/* =============== 右側: 情報エリア =============== */}
            <div className="w-full md:w-1/2 h-1/2 md:h-full p-4 lg:p-6 overflow-y-auto border-l border-border">
                <h1 className="text-2xl font-bold mb-4 border-b pb-2">訪問記録</h1>

                {!selectedMuseum && museums.length > 0 && (
                    <Card className="mt-4 bg-secondary/50">
                        <CardHeader><CardTitle className="text-lg">美術館を選択</CardTitle></CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground">地図上のマーカーをクリックするか、下記リストから選択してください。</p>
                            <ul className="mt-4 space-y-1 max-h-60 overflow-y-auto"> {/* スクロール可能にする */}
                                {museums.sort((a, b) => a.name.localeCompare(b.name)).map(m => ( // 名前順でソート
                                    <li key={m.id} className="cursor-pointer p-2 hover:bg-accent rounded flex justify-between items-center" onClick={() => handleMarkerClick(m.id)}>
                                        <span>{m.name}</span>
                                        <span className="text-xs text-muted-foreground">({m.exhibitions.length}回訪問)</span>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                )}
                {!selectedMuseum && museums.length === 0 && (
                     <Card className="mt-4 border-dashed border-primary/50">
                        <CardHeader><CardTitle className="text-lg">はじめに</CardTitle></CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground">まだ訪問記録がありません。</p>
                            <p className="text-muted-foreground mt-2">地図右上の「美術館を追加」ボタンから、訪問した美術館の情報を登録しましょう。</p>
                        </CardContent>
                    </Card>
                )}

                {selectedMuseum && (
                    <Card className="mt-4">
                        <CardHeader>
                            <div className="flex justify-between items-start mb-2"> {/* ボタンとタイトル配置調整 */}
                                <div>
                                    <CardTitle>{selectedMuseum.name}</CardTitle>
                                    <CardDescription>
                                        (緯度: {selectedMuseum.lat.toFixed(6)}, 経度: {selectedMuseum.lng.toFixed(6)})
                                        <br />
                                        総訪問回数: {selectedMuseum.exhibitions.length}回
                                    </CardDescription>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSelectedMuseumId(null)}
                                >
                                    一覧に戻る
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex justify-between items-center mb-3 border-b pb-2">
                                <h3 className="text-lg font-semibold">鑑賞した展覧会</h3>
                                <Dialog open={isAddExhibitionDialogOpen} onOpenChange={setIsAddExhibitionDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button size="sm" variant="outline">展覧会を追加</Button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-[480px]">
                                        <DialogHeader>
                                            <DialogTitle>展覧会を追加</DialogTitle>
                                            <DialogDescription>
                                                「{selectedMuseum.name}」で鑑賞した展覧会の情報を入力してください。
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="grid gap-4 py-4">
                                            <div className="grid grid-cols-4 items-center gap-4">
                                                <Label htmlFor="exhibition-name" className="text-right">
                                                    展覧会名 <span className="text-destructive">*</span>
                                                </Label>
                                                <Input id="exhibition-name" value={newExhibitionName} onChange={(e) => setNewExhibitionName(e.target.value)} className="col-span-3" required />
                                            </div>
                                            <div className="grid grid-cols-4 items-center gap-4">
                                                <Label className="text-right">
                                                    訪問日 <span className="text-destructive">*</span>
                                                </Label>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant={"outline"}
                                                            className={cn(
                                                                "col-span-3 justify-start text-left font-normal",
                                                                !newExhibitionDate && "text-muted-foreground"
                                                            )}
                                                        >
                                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                                            {newExhibitionDate ? format(newExhibitionDate, "yyyy年MM月dd日") : <span>日付を選択</span>}
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent className="w-full p-0" align="start">
                                                        <Calendar
                                                            mode="single"
                                                            selected={newExhibitionDate}
                                                            onSelect={(date) => {
                                                                // onSelect は Date | undefined | Date[] | null を返す可能性がある
                                                                if (date instanceof Date || date === undefined) {
                                                                    setNewExhibitionDate(date);
                                                                } else if (date === null) {
                                                                     setNewExhibitionDate(undefined); // null の場合は undefined にする
                                                                } else {
                                                                    // 配列などの予期しない型は無視するかエラー処理
                                                                    console.error('Invalid date selected:', date);
                                                                }
                                                            }}
                                                            disabled={(date) =>
                                                                date > new Date() || date < new Date("1900-01-01")
                                                            }
                                                            fromYear={1970}
                                                            toYear={new Date().getFullYear()}
                                                        />
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                            <div className="grid grid-cols-4 items-start gap-4">
                                                <Label htmlFor="exhibition-memo" className="text-right pt-2">メモ</Label>
                                                <Textarea id="exhibition-memo" value={newExhibitionMemo} onChange={(e) => setNewExhibitionMemo(e.target.value)} className="col-span-3 min-h-[80px]" placeholder="鑑賞の感想などを自由に入力 (任意)" />
                                            </div>
                                        </div>
                                        <DialogFooter>
                                            <Button type="button" variant="outline" onClick={() => setIsAddExhibitionDialogOpen(false)}>キャンセル</Button>
                                            <Button type="button" onClick={handleAddExhibition}>保存</Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            </div>

                            {selectedMuseum.exhibitions.length > 0 ? (
                                <div className="border rounded-md overflow-hidden">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[40%] font-semibold">展覧会名</TableHead>
                                                <TableHead className="w-[25%] font-semibold">訪問日</TableHead>
                                                <TableHead className="font-semibold">メモ</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {selectedMuseum.exhibitions.map(exhibition => (
                                                <TableRow key={exhibition.id}>
                                                    <TableCell className="font-medium">{exhibition.name}</TableCell>
                                                    <TableCell>{format(new Date(exhibition.date + 'T00:00:00'), "yyyy/MM/dd")}</TableCell> {/* タイムゾーン問題を避けるためT00:00:00を追加 */}
                                                    <TableCell className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{exhibition.memo || '-'}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground mt-4 text-center py-6 border rounded-md border-dashed">
                                    まだこの美術館で鑑賞した展覧会の記録はありません。
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}