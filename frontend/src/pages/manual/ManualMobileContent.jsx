const IMG = {
  snapshot: "/manual/mobile/screenshot_2026_02_27_134423_pm.png",
  logo: "/manual/mobile/mobile_logo_beer.png",
  img3776Copy: "/manual/mobile/img_3776_copy.png",
  img3776Copy2: "/manual/mobile/img_3776_copy2.png",
  img3790Copy: "/manual/mobile/img_3790_copy.png",
};

function Figure({ src, alt }) {
  return (
    <figure className="image">
      <a href={src}>
        <img src={src} alt={alt} />
      </a>
    </figure>
  );
}

export default function ManualMobileContent() {
  return (
    <>
      <article className="page sans">
        <header>
          <div className="page-header-icon undefined">
            <img className="icon" src="/images/icon.jpeg" alt="移动端手册" />
          </div>
          <h1 className="page-title" dir="auto">
            符号刘德语素材库移动端使用指南
          </h1>
          <p className="page-description" dir="auto"></p>
        </header>

        <div className="page-body">
          <div dir="auto">
            <details open>
              <summary className="manual-summary manual-summary--xl">1. 文化科普季基本介绍</summary>
              <div className="indented">
                <p>大家好，这是是符号刘！</p>
                <p>
                  欢迎来到
                  {" "}
                  <a href="https://www.xiaohongshu.com/user/profile/5b1f9ea611be101e03289ee0?xhsshare=CopyLink&appuid=5b1f9ea611be101e03289ee0&apptime=1720382542&share_id=f4f40ab3d94949149e1d46f15fe77dd9">
                    @符号刘
                  </a>
                  {" "}
                  的德语素材库-科普季！大家和我一起通过不同主题的文化科普视频来学德语吧！
                </p>
                <p>总共期数为50期！所有视频和学习资料，一经购买，学习永久有效哦！</p>
                <p><strong>制作过程中难免会出现错误，还请大家原谅！诚邀大家积极捉虫然后告诉我哦！非常感谢！</strong></p>
              </div>
            </details>
          </div>

          <div dir="auto">
            <details open>
              <summary className="manual-summary manual-summary--xl">2. 学习面板</summary>
              <div className="indented">
                <Figure src="/manual/mobile/img_3768.png" alt="学习面板" />
                <h2>2.1 学习统计</h2>
                <p>记录学习进程和自己定义为完成（见下面如何收藏和标记视频）的视频数量。</p>
                <Figure src="/manual/mobile/img_3769.png" alt="学习统计" />
                <h2>2.2 公告栏</h2>
                <p>任何和素材库相关更新信息和活动信息都会发布在公告栏哦，请多多关注。</p>
                <Figure src="/manual/mobile/img_3789.png" alt="公告栏" />
              </div>
            </details>
          </div>

          <div dir="auto">
            <details open>
              <summary className="manual-summary manual-summary--xl">3. 如何进行学习</summary>
              <div className="indented">
                <details open>
                  <summary className="manual-summary manual-summary--lg">3.1 筛选视频信息</summary>
                  <div className="indented">
                    <p>可以按照视频难度，时长，博主和话题对下方视频进行筛选。</p>
                    <Figure src="/manual/mobile/img_3770.png" alt="筛选视频信息" />
                  </div>
                </details>

                <details open>
                  <summary className="manual-summary manual-summary--lg">3.2 打开学习材料</summary>
                  <div className="indented">
                    <p>点击主页任何视频封面，进入学习模式。</p>
                    <Figure src="/manual/mobile/img_3771.png" alt="打开学习材料" />
                  </div>
                </details>

                <details open>
                  <summary className="manual-summary manual-summary--lg">3.3 学习模块组成</summary>
                  <div className="indented">
                    <details open>
                      <summary className="manual-summary manual-summary--md">1. 跟读模式</summary>
                      <div className="indented">
                        <h3>1. 动态字幕跟随</h3>
                        <Figure src="/manual/mobile/img_3772.png" alt="动态字幕跟随" />
                        <p><strong>可选择显示字幕为中德双语，还是德语或者中文。</strong></p>
                        <Figure src="/manual/mobile/img_3778.png" alt="字幕语言切换" />
                        <Figure src="/manual/mobile/img_3773.png" alt="字幕显示" />

                        <h3>2. 调整播放速度</h3>
                        <Figure src={IMG.logo} alt="调整播放速度-入口" />
                        <Figure src="/manual/mobile/img_3774.png" alt="调整播放速度-选项" />

                        <h3>3. 调整循环模式</h3>
                        <Figure src="/manual/mobile/img_3790.png" alt="循环模式-入口" />
                        <Figure src="/manual/mobile/img_3775.png" alt="循环模式-选项" />

                        <h3>4. 重点单词/地道表达面板</h3>
                        <Figure src="/manual/mobile/img_3776.png" alt="重点单词面板" />
                        <Figure src="/manual/mobile/img_3780.png" alt="表达面板" />
                        <p>单词在原句中播放</p>
                        <Figure src="/manual/mobile/img_3781.png" alt="原句播放 1" />
                        <Figure src="/manual/mobile/img_3782.png" alt="原句播放 2" />
                        <p>标记单词熟悉程度，标记后的单词卡片可以在德语卡片页面进行查看。</p>
                        <Figure src="/manual/mobile/img_3783.png" alt="单词标记" />

                        <h3>5. 跟读模式</h3>
                        <Figure src={IMG.img3776Copy} alt="跟读模式 1" />
                        <Figure src="/manual/mobile/img_3777.png" alt="跟读模式 2" />

                        <h3>6. 听写模式</h3>
                        <Figure src={IMG.img3776Copy2} alt="听写模式 1" />
                        <Figure src="/manual/mobile/img_3779.png" alt="听写模式 2" />
                      </div>
                    </details>

                    <details open>
                      <summary className="manual-summary manual-summary--md">2. 听力练习模式</summary>
                      <div className="indented">
                        <p>点击视频下方“题”按钮进入练习模式。</p>
                        <Figure src={IMG.img3790Copy} alt="听力练习入口" />
                        <p>每个视频都有4个听力理解题目：2个判断对错，2个单项选择题。点击选择后，会有答案和解释。</p>
                        <Figure src="/manual/mobile/img_3784.png" alt="听力练习题 1" />
                        <Figure src="/manual/mobile/img_3785.png" alt="听力练习题 2" />
                      </div>
                    </details>
                  </div>
                </details>
              </div>
            </details>
          </div>

          <div dir="auto">
            <details open>
              <summary className="manual-summary manual-summary--xl">4. 如何标记和收藏视频</summary>
              <div className="indented">
                <Figure src={IMG.snapshot} alt="标记与收藏 1" />
                <Figure src="/manual/mobile/img_3786.png" alt="标记与收藏 2" />
                <Figure src="/manual/mobile/img_3788.png" alt="标记与收藏 3" />
              </div>
            </details>
          </div>

          <div dir="auto">
            <details open>
              <summary className="manual-summary manual-summary--xl">5. 如何打开全部单词卡片</summary>
              <div className="indented">
                <Figure src="/manual/mobile/img_3787_2.png" alt="打开单词卡片 1" />
                <Figure src="/manual/mobile/img_3787.png" alt="打开单词卡片 2" />
              </div>
            </details>
          </div>
        </div>
      </article>
      <span className="sans"></span>
    </>
  );
}
