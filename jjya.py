
import json
import tkinter as tk
from tkinter import ttk, messagebox
from pathlib import Path

# 위험예지훈련 데이터
# 형식: (고유번호, 분류, 위험예지훈련, 작업 전 안전수칙)

DATA = [


    (1, "일상", "단자대 볼트 조임시 돌출부에 의한 긁힘",
     "적절한 공구 사용, 작업전 안전교육, 안전모, 절연장갑 착용"),

    (2, "일상", "분전반 쇄정",
     "모든 작업후 및 일상점검 시 분전반 쇄정확인 철저"),

    (3, "일상", "전기,기계기구를 이용한 작업시 각종 안전사고",
     "안전화, 안전모 착용, 작업전 안전교육, 보안경 착용, 그라인더·고속절단기 작업안전수칙 준수"),

    (4, "일상", "조작반 오조작에 의한 전원 투입",
     "작업 전 안전교육, 작업 전 계통 숙지, 작업중 표지판 부착, 작업안전수칙 준수"),

    (5, "일상", "모선,케이블헤드, 볼트 등 돌출부 충돌",
     "작업전 안전교육, 안전모, 절연장갑 착용, 전방주시 철저"),

    (6, "일상", "진공 인터럽터 절연불량으로 인한 가압",
     "작업전 안전교육, 절연장갑 및 절연화 착용, 작업개소 전원차단 및 검전 실시, 절연상태 확인, 작업안전수칙 준수"),

    (7, "일상", "교육훈련 및 절차 미준수",
     "직무교육 실시, 비상대응훈련 실시 사고사례 교육 실시"),

    (8, "일상", "배전반내 공간 협소 및 돌출부로 인한 외상",
     "작업전 안전교육, 안전모, 절연장갑 착용, 전방주시 철저"),

    (9, "일상", "점검중 활선 충전부 접근 및 접촉",
     "작업전 안전교육, 작업개소 전원차단 및 작업중 표지설치, 절연장갑착용"),

    (10, "일상,3개월,6개월,1년", "분전반 내부작업시 날카로운 부위에 긁힘",
     "작업전 안전교육, 안전모, 절연화, 절연장갑 착용, 내부 돌출부 및 날카로운 부위 확인, 무리한 작업자세 금지"),

    (11, "일상,3개월,6개월,1년", "수동 및 자동 오취급에 의한 감전사고",
     "작업 전 안전교육, 안전작업을 위한 접지 설치, 작업안전수칙 준수"),

    (12, "일상,3개월,6개월,1년", "작업구간이 협소하여 구조물과 충돌 발생",
     "작업전 안전교육, 안전모 착용, 작업공간 및 주변 돌출부 확인, 이동 동선 확보, 전방주시 철저"),

    (13, "3개월", "평활용 콘덴서 잔류전하에 의한 전류접촉",
     "작업전 안전교육, 계통숙지, 절연장갑착용,접촉전방전실시"),

    (14, "3개월", "축전지 단자전압 측정시 단락으로 인한 화상",
     "작업전 안전교육, 절연보호덮개취부, 절연장갑착용, 전기안전수칙준수"),

    (15, "3개월,6개월,1년", "정류부, 축전지 등 충전부 활선 접촉",
     "작업전 안전교육, 절연보호덮개취부, 절연장갑착용,전기안전수칙준수"),

    (16, "6개월,1년", "인출작업중 차단기 중량으로 인한 손, 발 끼임",
     "작업전 안전교육, 안전모, 절연장갑, 절연화 착용, 중량물 취급 매뉴얼 숙지"),

    (17, "수전선로", "맨홀, 트라프 등 중량물에 의한 손, 발 끼임",
     "작업전 안전교육, 안전모, 안전화, 보호장갑 착용, 중량물 취급 안전수칙 준수, 2인 1조 작업 및 협착 주의"),

    (18, "MCC", "MCC반 주변설비에 부딪힘",
     "작업전안전교육 및 사전위험 요소 파악, 안전모착용"),

    (19, "MCC", "MCC반 미 쇄정",
     "MCC반 쇄정상태 확인, 잠금장치 파손여부 확인"),

    (20, "MCC", "MCC반 내부 점검시 날카로운 부위에 긁힘",
     "안전모, 절연장갑 착용, 내부 돌출부 및 날카로운 부위 확인, 작업안전수칙 준수"),

    (21, "MCC", "MCC 오동작으로 인한 전원 투입",
     "작업전 안전교육, 작업개소 전원차단 및 작업중 표지설치, 절연장갑 착용, 전기안전수칙준수"),

    (22, "MCC", "콘덴서 폭발",
     "안전모, 보안경, 절연장갑 착용, 콘덴서 외관 및 이상징후 확인, 잔류전하 방전 및 무전압 확인"),

    (23, "MCC", "콘덴서 잔류전하에 의한 전류 접촉",
     "작업전 안전교육, 작업개소 전원차단 및 작업중 표지설치, 절연장갑착용, 접촉전방전실시"),
]

# 사용 횟수 저장 파일
SAVE_FILE = Path(__file__).resolve().parent / "업무일지_사용횟수.json"


def load_counts():
    if not SAVE_FILE.exists():
        return {}

    try:
        data = json.loads(SAVE_FILE.read_text(encoding="utf-8"))

        if not isinstance(data, dict):
            raise ValueError("저장 데이터 형식 오류")

        return {
            str(k): int(v)
            for k, v in data.items()
            if int(v) >= 0
        }

    except (OSError, ValueError, TypeError) as e:
        messagebox.showerror(
            "파일 오류",
            f"사용 횟수 파일을 읽을 수 없습니다.\n{e}"
        )
        return None


def save_counts(data):
    try:
        temp_file = SAVE_FILE.with_suffix(".tmp")

        temp_file.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

        temp_file.replace(SAVE_FILE)
        return True

    except OSError as e:
        messagebox.showerror("저장 오류", str(e))
        return False


# 메인 윈도우
root = tk.Tk()
root.title("일일업무일지 생성기")
root.geometry("1050x750")
root.minsize(800, 580)

counts = load_counts()

if counts is None:
    root.destroy()
    raise SystemExit("사용 횟수 파일 확인 필요")

filter_var = tk.StringVar(value="전체")
status_var = tk.StringVar(value="위험예지훈련 항목을 더블클릭하세요.")

pending_item = None
pending_category = None
pending_confirmed = False


# 분류별 사용 횟수 독립 관리
def count_key(category, item_id):
    if category == "전체":
        return str(item_id)

    return f"{category}|{item_id}"


def usage_count(category, item_id):
    return counts.get(count_key(category, item_id), 0)


# 메인 프레임
outer = ttk.Frame(root, padding=12)
outer.pack(fill="both", expand=True)

ttk.Label(
    outer,
    text="위험예지훈련 선택 및 사용 횟수",
    font=("맑은 고딕", 12, "bold")
).pack(anchor="w")


# 분류 선택
bar = ttk.Frame(outer)
bar.pack(fill="x", pady=10)

ttk.Label(bar, text="분류 선택:").pack(side="left")

filter_box = ttk.Combobox(
    bar,
    textvariable=filter_var,
    state="readonly",
    width=15,
    values=[
        "전체",
        "MCC",
        "일상",
        "수전선로",
        "3개월",
        "6개월",
        "1년"
    ]
)

filter_box.pack(side="left", padx=10)

ttk.Label(
    bar,
    text="※ 사용 횟수가 적은 순서로 표시됩니다."
).pack(side="left")


# 위험예지훈련 목록
frame = ttk.Frame(outer)
frame.pack(fill="both", expand=True)

columns = ("group", "risk", "count")

tree = ttk.Treeview(
    frame,
    columns=columns,
    show="headings",
    selectmode="browse",
    height=11
)

tree.heading("group", text="분류")
tree.heading("risk", text="위험예지훈련")
tree.heading("count", text="사용 횟수")

tree.column("group", width=180, anchor="center")
tree.column("risk", width=650, anchor="w")
tree.column("count", width=100, anchor="center")

scroll = ttk.Scrollbar(
    frame,
    orient="vertical",
    command=tree.yview
)

tree.configure(yscrollcommand=scroll.set)

tree.pack(side="left", fill="both", expand=True)
scroll.pack(side="right", fill="y")


def filtered_data():
    category = filter_var.get()

    if category == "전체":
        return DATA

    return [
        item for item in DATA
        if category in item[1].split(",")
    ]


def refresh_tree(selected=None):
    category = filter_var.get()

    tree.delete(*tree.get_children())

    sorted_data = sorted(
    	filtered_data(),
    	key=lambda item: item[0]
    )

    for item_id, group, risk, rules in sorted_data:
        tree.insert(
            "",
            "end",
            iid=str(item_id),
            values=(
                group,
                risk,
                usage_count(category, item_id)
            )
        )

    if selected is not None and tree.exists(str(selected)):
        tree.selection_set(str(selected))
        tree.see(str(selected))


def category_changed(event=None):
    refresh_tree()

    status_var.set(
        f"{filter_var.get()} 분류를 선택했습니다. "
        "원하는 항목을 더블클릭하세요."
    )


filter_box.bind("<<ComboboxSelected>>", category_changed)


# 업무일지 출력 영역
ttk.Label(
    outer,
    text="생성된 일일업무일지",
    font=("맑은 고딕", 12, "bold")
).pack(anchor="w", pady=(12, 6))

output = tk.Text(
    outer,
    height=10,
    wrap="word",
    font=("맑은 고딕", 10),
    undo=True
)

output.pack(fill="both", expand=True)


# 일일업무일지 생성
def generate(item):
    global pending_item, pending_category, pending_confirmed

    item_id, group, risk, rules = item

    contents = (
        f"* 업무 인수인계 및 업무분장, 안전교육\n"
        f"* 근골격계질환 대비 스트레칭 실시\n"
        f"* 위험예지훈련 실시({risk})\n"
        f"  - 작업 전 : {rules}\n"
        f"* 위험예지훈련 실시({risk})\n"
        f"  - 작업 후 : 특이사항 없음\n"
        f"* 사무실 정리정돈 및 업무 인수인계"
    )

    pending_item = item_id
    pending_category = filter_var.get()
    pending_confirmed = False

    output.delete("1.0", "end")
    output.insert("1.0", contents)

    refresh_tree(item_id)

    status_var.set(
        f"미확정 | {risk} | "
        f"현재 사용 횟수: "
        f"{usage_count(pending_category, item_id)}회"
    )


# 더블클릭 이벤트
def on_double_click(event):
    if tree.identify_region(event.x, event.y) != "cell":
        return

    row_id = tree.identify_row(event.y)

    if not row_id:
        return

    for item in DATA:
        if str(item[0]) == row_id:
            generate(item)
            break


tree.bind("<Double-1>", on_double_click)


# 복사 및 확정
def copy_and_confirm():
    global pending_confirmed

    content = output.get("1.0", "end-1c")

    if not content.strip() or pending_item is None:
        messagebox.showinfo(
            "안내",
            "먼저 위험예지훈련 항목을 더블클릭하세요."
        )
        return

    # 클립보드 복사
    try:
        root.clipboard_clear()
        root.clipboard_append(content)
        root.update()

    except tk.TclError as e:
        messagebox.showerror("복사 실패", str(e))
        return

    # 처음 확정할 때만 카운트 증가
    if not pending_confirmed:
        key = count_key(pending_category, pending_item)

        new_counts = counts.copy()
        new_counts[key] = new_counts.get(key, 0) + 1

        if not save_counts(new_counts):
            messagebox.showwarning(
                "확정 실패",
                "클립보드에는 복사되었지만 "
                "사용 횟수 저장에 실패했습니다."
            )
            return

        counts.update(new_counts)
        pending_confirmed = True

    refresh_tree(pending_item)

    status_var.set(
        f"복사 및 확정 완료 | "
        f"{pending_category} | "
        f"사용 횟수: "
        f"{usage_count(pending_category, pending_item)}회"
    )


# 버튼
button_frame = ttk.Frame(outer)
button_frame.pack(fill="x", pady=10)

ttk.Button(
    button_frame,
    text="복사 및 확정 (+1회)",
    command=copy_and_confirm
).pack(side="left")


# 상태 표시
ttk.Label(
    outer,
    textvariable=status_var,
    foreground="blue"
).pack(anchor="w")

refresh_tree()

root.mainloop()
