// 海エリアのマップ、住民、調査内容、選べる対策をまとめる。
const oceanArea = {
  id: "ocean",
  name: "潮風の町",
  region: "海のエリア",
  maps: {
    town: {
      name: "潮風の町",
      map: [
        "#####################",
        "#PPPPPPPPPPPPPPPPPPP#",
        "#P......T.P.T......P#",
        "#PTHHHHfffPfffHHHHTP#",
        "#P.HHHHff.P.ffHHHH.P#",
        "#PfHHHHff.P.ffHHHHfP#",
        "#P..P....fPf...P...P#",
        "#PPPPPPPPPPPPPPPPPPP#",
        "#P..P.....P....P...P#",
        "#PfHHHHTT.P.RRHHHHfP#",
        "#P.HHHHTT.P.RRHHHH.P#",
        "#PTHHHHTTfPfRRHHHHTP#",
        "#P......T.P.T......P#",
        "#PPPPPPPPPPPPPPPPPPP#",
        "#####################",
      ],
      spawn: { x: 2, y: 2 },
      features: [
        { id: "fisher", kind: "person", name: "漁師のミナ", x: 9, y: 4 },
        { id: "fieldGate", kind: "entrance", name: "海岸のフィールドへ", x: 10, y: 13, icon: "門", destination: "field" },
        { id: "portal", kind: "portal", name: "砂漠の町への道", x: 19, y: 7, icon: "⇄" },
      ],
    },
    field: {
      name: "川辺と海岸のフィールド",
      map: [
        "#####################",
        "#..............bb~~~~",
        "#..fff...~.ff..bb~~~~",
        "#..fffT..~...fRbb~~~~",
        "#.......~..TT..bb~~~~",
        "#.T..T..~.hh.hRbb~~~~",
        "#....hh.~.....hbb~~~~",
        "#PPPPPPPBPPPPPPPPPPPP",
        "#PhTh...~....Thbb~~~~",
        "#P...TR.~...R..bb~~~~",
        "#P.ff..R.~.f.fTbb~~~~",
        "#P...f...~..f..bb~~~~",
        "#PPPPPPPPPPPPPPbb~~~~",
        "#P..................#",
        "#####################",
      ],
      spawn: { x: 2, y: 12 },
      features: [
        { id: "river", kind: "clue", name: "川の調査", x: 6, y: 6, icon: "?" },
        { id: "shore", kind: "clue", name: "海岸の調査", x: 16, y: 6, icon: "?" },
        { id: "townGate", kind: "entrance", name: "潮風の町へ", x: 1, y: 13, icon: "門", destination: "town" },
      ],
    },
  },
  createState() {
    return { talked: false, river: false, shore: false, actions: [] };
  },
  getStatus(state) {
    if (state.actions.length === 0) return "海岸にはまだごみが残っている";
    if (state.actions.length === 3) return "町と海が協力して対策中（ごみはすぐにはなくならない）";
    return `対策が動き始めた（${state.actions.length}/3 種類）`;
  },
  getQuest(state) {
    if (!state.river || !state.shore) {
      return {
        title: "海へ流れるごみの道を探そう",
        description: `川と海岸を調べよう。調査できた場所：${Number(state.river) + Number(state.shore)}/2`,
      };
    }
    return {
      title: "町のみんなと海を守ろう",
      description: `調査完了。できる対策を選ぼう：${state.actions.length}/3`,
    };
  },
  interact(id, state) {
    if (id === "fisher") {
      state.talked = true;
      if (!state.river || !state.shore) {
        return {
          title: "漁師のミナ",
          text: "最近、網にごみがかかるんだ。川から流れてくるものもあれば、風で海岸に運ばれるものもあるみたい。川と浜辺を調べて、どこから来るのか一緒に考えてくれない？",
        };
      }
      if (state.actions.length === 3) {
        return {
          title: "漁師のミナ",
          text: "海岸は少しずつきれいになってきたね。拾うだけでなく、ごみを出にくくする工夫も続けよう。海に残った細かなプラスチックをすぐになくすのは難しいから、これからも見守りが必要だね。",
        };
      }
      return {
        title: "漁師のミナ",
        text: "調査ありがとう！できることは一つだけじゃないよ。ごみを回収し、流れ込むのを防ぎ、使い捨てを減らす工夫を組み合わせよう。",
        choices: oceanChoices(state),
      };
    }

    if (id === "river") {
      state.river = true;
      return {
        title: "川の調査",
        text: "雨水の排水路や川沿いに、包装や飲み物の容器が落ちている。街で適切に捨てられなかったごみは、雨や風で川へ運ばれ、海に届くことがある。川のごみを拾うだけでなく、陸でごみを減らすことも大切だ。",
      };
    }

    if (id === "shore") {
      state.shore = true;
      return {
        title: "海岸の調査",
        text: "浜辺には容器の破片や漁具の一部が見つかった。ごみには、陸から来るものと海で使われて流出するものがある。プラスチックは細かく砕けても自然にすぐ消えるわけではなく、生き物が飲み込んだり絡まったりする危険がある。",
      };
    }

    return null;
  },
  choose(id, state) {
    const choice = oceanChoices(state).find((item) => item.id === id);
    if (!choice) return null;
    state.actions.push(id);
    return {
      title: choice.label,
      text: choice.result,
    };
  },
};

function oceanChoices(state) {
  const choices = [
    {
      id: "cleanup",
      label: "海岸や川のごみを安全に回収する",
      result: "町の人と海岸・川のごみを回収した。生き物がごみに触れる危険を減らせるけれど、回収だけでは次に流れ着くごみを防げない。安全に気をつけ、継続して行う必要がある。",
    },
    {
      id: "prevention",
      label: "排水路の見回りと、ごみを流さない仕組みを整える",
      result: "排水路を見回り、ごみ箱や回収の案内を増やした。川へ流れ込むごみを減らす助けになるが、すべての流出を防げるわけではない。街全体での適切な廃棄も大切だ。",
    },
    {
      id: "reduce",
      label: "詰め替えや繰り返し使える品を選び、使い捨てを減らす",
      result: "お店や住民が、必要なものを選んで使い捨て品を減らし始めた。ごみの発生を抑える長期的な対策になる。回収や再利用の仕組みも続け、無理のない選択を広げよう。",
    },
  ];
  return choices.filter((choice) => !state.actions.includes(choice.id));
}
